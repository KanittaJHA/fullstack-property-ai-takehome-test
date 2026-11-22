import { hasAdminSession } from "@/server/backend";
import { AdminAccess } from "@/features/admin/admin-access";
import { AdminWorkspace } from "@/features/admin/admin-workspace";

export default async function AdminPage() {
  return await hasAdminSession() ? <AdminWorkspace /> : <AdminAccess />;
}
