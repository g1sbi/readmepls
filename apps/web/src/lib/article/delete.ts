import type PocketBase from "pocketbase";

/**
 * Delete the current user's article. Ownership is enforced by the PocketBase
 * `articles` delete rule (`user = @request.auth.id`); dependents (highlights,
 * article_tags, collection_items) are removed by relation cascade. The shared
 * `content` row is never touched.
 */
export async function deleteArticle(pb: PocketBase, id: string): Promise<void> {
  await pb.collection("articles").delete(id);
}
