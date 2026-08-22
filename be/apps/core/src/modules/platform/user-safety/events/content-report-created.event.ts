import type { CommentReportReason } from '../user-safety.types'

export class ContentReportCreatedEvent {
  constructor(
    public readonly reportId: string,
    public readonly tenantId: string,
    public readonly photoId: string,
    public readonly commentId: string,
    public readonly reporterUserId: string,
    public readonly reportedUserId: string,
    public readonly reason: CommentReportReason,
    public readonly details: string | null,
    public readonly contentSnapshot: string,
    public readonly createdAt: string,
  ) {}
}
