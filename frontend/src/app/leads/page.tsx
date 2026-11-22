import { hasAdminSession } from "@/server/backend";
import { AdminAccess } from "@/features/admin/admin-access";
import { LeadsDashboard } from "@/features/leads/leads-dashboard";
export default async function LeadsPage() {
  return await hasAdminSession() ? <LeadsDashboard /> : <AdminAccess destination="/leads" />;
}
