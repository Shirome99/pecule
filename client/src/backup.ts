// Restauration d'une sauvegarde (app mobile) : partagée par l'accueil et les Réglages.

/** Lit un fichier de sauvegarde choisi par l'utilisateur, demande confirmation puis redémarre l'app. */
export async function restoreFromFile(file: File, hasData: boolean) {
  const { inspectBackup, restoreBackup } = await import('@pecule/local');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { operations } = await inspectBackup(bytes);
  const question = hasData
    ? `Remplacer toutes les données de l’app par cette sauvegarde (${operations} opération${operations > 1 ? 's' : ''}) ? Les données actuelles seront perdues.`
    : `Restaurer cette sauvegarde (${operations} opération${operations > 1 ? 's' : ''}) ?`;
  if (!window.confirm(question)) return false;
  await restoreBackup(bytes);
  localStorage.removeItem('pecule_token');
  localStorage.removeItem('pecule_user');
  window.location.replace('/');
  return true;
}
