import { studyTimestamp } from "./dateTime";

export function latestPractice(reviews, recordId) {
  return reviews.filter(review => String(review.record_id) === String(recordId)
    && Number.isInteger(review.payload?.correct) && Number.isInteger(review.payload?.total)
    && review.payload.total > 0 && review.payload.correct >= 0 && review.payload.correct <= review.payload.total
    && [undefined, "wrong", "all"].includes(review.payload.mode))
    .reduce((latest, review) => {
      if (!latest) return review;
      const currentTime = studyTimestamp(review.created_at), latestTime = studyTimestamp(latest.created_at);
      return Number.isFinite(currentTime) && (!Number.isFinite(latestTime) || currentTime > latestTime) ? review : latest;
    }, null);
}
