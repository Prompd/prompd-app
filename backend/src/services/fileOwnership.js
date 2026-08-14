/* Fail-closed file ownership. Access is granted ONLY when the file records a
 * concrete owner id that equals the (concrete) requesting user id.
 *
 * Why strict: file metadata written before the `userId` virtual existed stored
 * `userId: undefined`, and the old check `metadata.userId !== userId` passed
 * whenever BOTH sides were undefined — meaning any authenticated user (whose
 * userId was also undefined then) could read any file. This helper closes that:
 * a missing id on either side denies, so legacy owner-less files are
 * inaccessible and a request with no resolved user id can never match them. */
export function ownsFile(metadata, userId) {
  if (!metadata) return false
  const owner = metadata.userId
  if (!owner || !userId) return false
  return owner === userId
}
