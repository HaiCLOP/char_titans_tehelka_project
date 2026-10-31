import type { Role } from "@/lib/domain";

/**
 * Which complaints the agent's tools may read. Decided on the server from the caller's profile —
 * the model never sees or chooses it.
 *  - dept_admin: always their own department (no department yet → refused, never "everything")
 *  - super_admin: all departments, or one they picked in the UI
 */
export type AgentScope = { role: "dept_admin" | "super_admin"; departmentId: string | null };

export class AgentScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentScopeError";
  }
}

export function agentScope(
  profile: { role: Role; department_id: string | null },
  requestedDepartment?: string | null,
): AgentScope {
  if (profile.role === "super_admin") return { role: "super_admin", departmentId: requestedDepartment ?? null };
  if (profile.role === "dept_admin") {
    if (!profile.department_id) throw new AgentScopeError("You are not assigned to a department yet");
    return { role: "dept_admin", departmentId: profile.department_id };
  }
  throw new AgentScopeError("Not allowed for your role");
}

/** department_load compares departments, so only a super admin looking at all of them gets it. */
export const canCompareDepartments = (scope: AgentScope) => scope.role === "super_admin" && scope.departmentId === null;
