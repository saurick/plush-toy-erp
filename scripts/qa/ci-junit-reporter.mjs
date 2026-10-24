import { junit } from "node:test/reporters";
import path from "node:path";

// GitLab deduplicates classname/name; Node's native classname is only "test".
// Preserve its failure/skip handling and qualify names with their source identity.
async function* identify(source) {
  for await (const event of source) {
    if (event.data?.file && event.data?.name) {
      const relative = path
        .relative(process.cwd(), event.data.file)
        .split(path.sep)
        .join("/");
      const file = relative.startsWith("../")
        ? path.basename(event.data.file)
        : relative;
      yield {
        ...event,
        data: {
          ...event.data,
          name: `${file}:${event.data.line || 0} · ${event.data.name}${event.data.testNumber ? ` [${event.data.testNumber}]` : ""}`,
        },
      };
    } else yield event;
  }
}

export default async function* report(source) {
  yield* junit(identify(source));
}
