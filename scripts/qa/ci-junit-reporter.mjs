import { junit } from "node:test/reporters";
import path from "node:path";

// Node matches start/result events by name; keep that identity intact and use
// classname for GitLab deduplication, including repeated names on the same line.
async function* identify(source) {
  const occurrences = new Map();
  for await (const event of source) {
    if (["test:pass", "test:fail"].includes(event.type) && event.data?.file && event.data?.name) {
      let relative = path.relative(path.resolve(import.meta.dirname, "../.."), event.data.file);
      if (relative.startsWith(`..${path.sep}`)) relative = path.relative(process.cwd(), event.data.file);
      const file = (relative.startsWith(`..${path.sep}`) ? path.basename(event.data.file) : relative).split(path.sep).join("/");
      const identity = `${file}:${event.data.line || 0}`;
      const key = `${identity}\n${event.data.name}`;
      const occurrence = (occurrences.get(key) || 0) + 1;
      occurrences.set(key, occurrence);
      yield {
        ...event,
        data: {
          ...event.data,
          classname: `${identity} [${occurrence}]`,
          file,
        },
      };
    } else yield event;
  }
}

export default async function* report(source) {
  yield* junit(identify(source));
}
