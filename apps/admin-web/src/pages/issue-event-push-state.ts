export interface IssuePushDraft { locationName: string; foundAt: string; category: string; description: string }
export interface IssuePushResult { issueId: string; shareUrl: string; cardImageUrl: string; issueDetailUrl: string }
export function validateIssuePushDraft(value: IssuePushDraft) { return Object.values(value).every((item) => item.trim().length > 0); }
