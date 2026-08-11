package server

import (
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"

	"golang.org/x/net/html"
)

const (
	maxTemplatePDFEmbeddedImageCount = 32
	maxTemplatePDFEmbeddedImageBytes = 5 << 20
	maxTemplatePDFEmbeddedTotalBytes = 16 << 20
	maxTemplatePDFDOMNodeCount       = 20_000
	maxTemplatePDFCSSBytes           = 4 << 20
)

var (
	templatePDFCSSUnsafePattern  = regexp.MustCompile(`(?i)(@\s*import\b|\bexpression\s*\(|\b(?:https?|file|ftp|wss?|javascript)\s*:|behavior\s*:|-moz-binding)`)
	templatePDFCSSURLPattern     = regexp.MustCompile(`(?i)\burl\s*\(`)
	templatePDFCSSCommentPattern = regexp.MustCompile(`(?s)/\*.*?\*/`)
	templatePDFDataImagePattern  = regexp.MustCompile(`(?i)^data:image/(png|jpe?g|webp|gif);base64,([a-z0-9+/=]+)$`)
)

var templatePDFAllowedElements = map[string]struct{}{
	"html": {}, "head": {}, "body": {}, "title": {}, "meta": {}, "style": {},
	"main": {}, "section": {}, "article": {}, "header": {}, "footer": {}, "aside": {}, "figure": {}, "figcaption": {}, "div": {}, "span": {},
	"h1": {}, "h2": {}, "h3": {}, "h4": {}, "h5": {}, "h6": {}, "p": {}, "br": {}, "hr": {},
	"table": {}, "caption": {}, "colgroup": {}, "col": {}, "thead": {}, "tbody": {}, "tfoot": {},
	"tr": {}, "th": {}, "td": {}, "ul": {}, "ol": {}, "li": {}, "dl": {}, "dt": {}, "dd": {},
	"strong": {}, "b": {}, "em": {}, "i": {}, "u": {}, "s": {}, "small": {}, "sub": {}, "sup": {},
	"img": {}, "picture": {}, "a": {}, "label": {}, "input": {}, "textarea": {}, "select": {}, "option": {},
	"svg": {}, "g": {}, "path": {}, "rect": {}, "circle": {}, "ellipse": {}, "line": {}, "polyline": {},
	"polygon": {}, "text": {}, "tspan": {}, "defs": {}, "clippath": {}, "lineargradient": {},
	"radialgradient": {}, "stop": {}, "marker": {},
}

var templatePDFAllowedAttributes = map[string]struct{}{
	"id": {}, "class": {}, "style": {}, "title": {}, "lang": {}, "dir": {}, "role": {},
	"alt": {}, "width": {}, "height": {}, "rowspan": {}, "colspan": {}, "scope": {}, "headers": {},
	"start": {}, "reversed": {}, "type": {}, "value": {}, "name": {}, "content": {}, "charset": {},
	"placeholder": {}, "checked": {}, "selected": {}, "disabled": {}, "readonly": {}, "multiple": {},
	"size": {}, "maxlength": {}, "rows": {}, "cols": {}, "contenteditable": {}, "tabindex": {},
	"xmlns": {}, "viewbox": {}, "preserveaspectratio": {}, "fill": {}, "fill-rule": {}, "stroke": {},
	"stroke-width": {}, "stroke-linecap": {}, "stroke-linejoin": {}, "stroke-dasharray": {}, "opacity": {},
	"d": {}, "x": {}, "y": {}, "x1": {}, "y1": {}, "x2": {}, "y2": {}, "cx": {}, "cy": {},
	"r": {}, "rx": {}, "ry": {}, "points": {}, "transform": {}, "offset": {}, "stop-color": {},
	"stop-opacity": {}, "clip-path": {}, "gradientunits": {}, "gradienttransform": {}, "text-anchor": {},
	"dominant-baseline": {}, "font-size": {}, "font-family": {}, "font-weight": {}, "markerheight": {},
	"markerwidth": {}, "marker-start": {}, "marker-mid": {}, "marker-end": {}, "orient": {}, "refx": {}, "refy": {},
	"src": {}, "href": {},
}

type templatePDFHTMLValidationState struct {
	imageBytes int
	imageCount int
	nodeCount  int
	cssBytes   int
}

func validateTemplatePDFHTML(htmlDocument string) error {
	doc, err := html.Parse(strings.NewReader(htmlDocument))
	if err != nil {
		return errors.New("html 内容无法解析")
	}
	state := &templatePDFHTMLValidationState{}
	if err := validateTemplatePDFHTMLNode(doc, state); err != nil {
		return err
	}
	return nil
}

func validateTemplatePDFHTMLNode(node *html.Node, state *templatePDFHTMLValidationState) error {
	if node == nil {
		return nil
	}
	if state == nil {
		return errors.New("html 校验状态无效")
	}
	state.nodeCount++
	if state.nodeCount > maxTemplatePDFDOMNodeCount {
		return errors.New("html 节点数量超出限制")
	}
	if node.Type == html.ElementNode {
		tag := strings.ToLower(strings.TrimSpace(node.Data))
		if _, ok := templatePDFAllowedElements[tag]; !ok {
			return fmt.Errorf("html 包含不允许的标签: %s", tag)
		}
		for _, attr := range node.Attr {
			if err := validateTemplatePDFHTMLAttribute(tag, attr, state); err != nil {
				return err
			}
		}
		if tag == "style" {
			for child := node.FirstChild; child != nil; child = child.NextSibling {
				if child.Type == html.TextNode {
					if err := validateTemplatePDFCSS(child.Data, state); err != nil {
						return err
					}
				}
			}
		}
	}
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if err := validateTemplatePDFHTMLNode(child, state); err != nil {
			return err
		}
	}
	return nil
}

func validateTemplatePDFHTMLAttribute(tag string, attr html.Attribute, state *templatePDFHTMLValidationState) error {
	name := strings.ToLower(strings.TrimSpace(attr.Key))
	value := strings.TrimSpace(attr.Val)
	if name == "" || strings.HasPrefix(name, "on") || name == "srcset" || name == "srcdoc" || name == "http-equiv" || name == "formaction" {
		return fmt.Errorf("html 包含不允许的属性: %s", name)
	}
	if strings.HasPrefix(name, "data-") || strings.HasPrefix(name, "aria-") {
		return nil
	}
	if _, ok := templatePDFAllowedAttributes[name]; !ok {
		return fmt.Errorf("html 包含不允许的属性: %s", name)
	}
	if name == "style" {
		return validateTemplatePDFCSS(value, state)
	}
	if name == "src" {
		if tag != "img" {
			return fmt.Errorf("html 标签 %s 不允许 src 属性", tag)
		}
		return validateTemplatePDFDataImage(value, state)
	}
	if name == "href" {
		if value != "" && !strings.HasPrefix(value, "#") {
			return errors.New("html 链接只能引用文档内部锚点")
		}
	}
	if strings.Contains(value, "\\") || templatePDFCSSUnsafePattern.MatchString(value) || templatePDFCSSURLPattern.MatchString(value) {
		if err := validateTemplatePDFCSS(value, state); err != nil {
			return err
		}
	}
	return nil
}

func validateTemplatePDFCSS(cssText string, state *templatePDFHTMLValidationState) error {
	if state == nil {
		return errors.New("html 样式校验状态无效")
	}
	state.cssBytes += len(cssText)
	if state.cssBytes > maxTemplatePDFCSSBytes {
		return errors.New("html 样式内容超出限制")
	}
	// CSS comments are inert, but removing them before validation also closes
	// comment-splitting bypasses such as u/**/rl(http://...).
	cssText = templatePDFCSSCommentPattern.ReplaceAllString(cssText, "")
	if strings.Contains(cssText, "\\") || templatePDFCSSUnsafePattern.MatchString(cssText) {
		return errors.New("html 样式包含不允许的外部资源或动态表达式")
	}
	remaining := cssText
	for {
		location := templatePDFCSSURLPattern.FindStringIndex(remaining)
		if location == nil {
			break
		}
		valueStart := location[1]
		valueEnd := strings.IndexByte(remaining[valueStart:], ')')
		if valueEnd < 0 {
			return errors.New("html 样式中的 url() 非法")
		}
		valueEnd += valueStart
		value := strings.TrimSpace(remaining[valueStart:valueEnd])
		value = strings.Trim(value, `"'`)
		switch {
		case strings.HasPrefix(value, "#") && len(value) > 1:
		case strings.HasPrefix(strings.ToLower(value), "data:image/"):
			if err := validateTemplatePDFDataImage(value, state); err != nil {
				return err
			}
		default:
			return errors.New("html 样式只能引用内嵌图片或文档内部锚点")
		}
		remaining = remaining[valueEnd+1:]
	}
	return nil
}

func validateTemplatePDFDataImage(value string, state *templatePDFHTMLValidationState) error {
	matches := templatePDFDataImagePattern.FindStringSubmatch(strings.TrimSpace(value))
	if len(matches) != 3 {
		return errors.New("打印图片必须是内嵌的 PNG、JPEG、WebP 或 GIF")
	}
	if state == nil {
		return errors.New("打印图片校验状态无效")
	}
	if state.imageCount >= maxTemplatePDFEmbeddedImageCount {
		return errors.New("整份打印内容的图片数量超出限制")
	}
	encoded := matches[2]
	decodedSize := base64.StdEncoding.DecodedLen(len(encoded))
	if strings.HasSuffix(encoded, "==") {
		decodedSize -= 2
	} else if strings.HasSuffix(encoded, "=") {
		decodedSize--
	}
	if decodedSize <= 0 {
		return errors.New("打印图片数据非法")
	}
	if decodedSize > maxTemplatePDFEmbeddedImageBytes {
		return errors.New("单张打印图片大小超出限制")
	}
	if state.imageBytes+decodedSize > maxTemplatePDFEmbeddedTotalBytes {
		return errors.New("整份打印内容的图片总大小超出限制")
	}

	decodedBytes, err := io.Copy(io.Discard, base64.NewDecoder(base64.StdEncoding, strings.NewReader(encoded)))
	if err != nil || decodedBytes <= 0 || decodedBytes != int64(decodedSize) {
		return errors.New("打印图片数据非法")
	}
	state.imageCount++
	state.imageBytes += int(decodedBytes)
	return nil
}
