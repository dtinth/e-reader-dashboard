export function unwrap<T>(input: { data?: T; error?: any }) {
  if (input.error) {
    if (typeof input.error !== "object") {
      throw new Error(input.error);
    } else {
      throw input.error;
    }
  }
  return input.data as T;
}
