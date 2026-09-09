import { extractForeground } from "./foreground";
self.onmessage = (event: MessageEvent) => {
  try {
    const { pixels, width, height, options } = event.data;
    const result = extractForeground(pixels, width, height, options);
    self.postMessage({ result }, { transfer: [result.pixels.buffer] });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
