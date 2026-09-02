export function notifyActionError(error) {
  console.error(error);

  const message =
    error?.message
    || "Ocorreu um erro inesperado.";

  ui.notifications.error(message);
}
