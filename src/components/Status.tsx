export function Loading() {
  return (
    <p className="status" role="status">
      Loading…
    </p>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="status status-error" role="alert">
      {message}
    </p>
  );
}
