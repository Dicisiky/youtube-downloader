// Re-exported (not redefined) so every backend module shares the exact enum
// objects Prisma's generated client uses -- a locally redeclared TS enum with
// identical string values is NOT structurally assignable to Prisma's nominal
// $Enums types, which would break every `prisma.*.update({ data: { status } })` call.
export { LiveStatus, RecordingStatus, JobStatus, Visibility } from '@prisma/client';
