import { getBusinessProfile, hasAdminSession } from "@/server/backend";
import { AdminAccess } from "@/features/admin/admin-access";
import { KnowledgeWorkspace } from "@/features/knowledge/knowledge-workspace";
import { KnowledgeLoadError } from "@/features/knowledge/knowledge-load-error";

export default async function KnowledgePage() {
  if (!(await hasAdminSession())) return <AdminAccess destination="/knowledge" />;
  const profile = await getBusinessProfile().catch(() => null);
  return profile ? <KnowledgeWorkspace profile={profile} /> : <KnowledgeLoadError />;
}
