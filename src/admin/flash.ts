// A message carried from one screen to the next ("Added Blue Lines."), shown
// once by the screen that opens.
let pending: string | null = null;

export function setFlash(message: string) {
  pending = message;
}

export function takeFlash(): string | null {
  const message = pending;
  pending = null;
  return message;
}
