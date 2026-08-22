export const COMMENT_REPORT_REASONS = [
  'spam',
  'harassment',
  'hate_or_violence',
  'sexual_content',
  'abusive_behavior',
  'other',
] as const

export type CommentReportReason = (typeof COMMENT_REPORT_REASONS)[number]
