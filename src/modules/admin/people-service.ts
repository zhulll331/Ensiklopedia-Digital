import "server-only";
import { revalidatePath } from "next/cache";
import {
  getServerEnv,
  isSupabaseAdminConfigured,
  isSupabaseConfigured,
} from "@/lib/server/env";
import { createRequestId } from "@/lib/server/http";
import { logServerEvent } from "@/lib/server/logger";
import {
  createAdminSecretSupabaseClient,
  createAdultSessionSupabaseClient,
} from "@/lib/server/supabase";
import type { AdminSessionResult } from "@/modules/admin/auth";
import {
  mapAdminPeoplePostgresError,
  type SchoolStatus,
  type TeacherAccountStatus,
  type TeacherSchoolLinkStatus,
} from "@/modules/admin/people-schemas";
import { DomainError } from "@/modules/learning/errors";
import { isSupabaseSchemaNotReadyError } from "@/modules/learning/supabase-store";

export interface AdminTeacherSchoolLink {
  school_id: string;
  school_name: string;
  district_label: string;
  link_status: TeacherSchoolLinkStatus;
  school_status: SchoolStatus;
}

export interface AdminTeacherRow {
  user_id: string;
  display_name: string;
  email: string | null;
  status: TeacherAccountStatus;
  schools: AdminTeacherSchoolLink[];
  created_at_utc: string;
  updated_at_utc: string;
}

export interface AdminSchoolRow {
  id: string;
  name: string;
  district_label: string;
  status: SchoolStatus;
  active_teacher_count: number;
  created_at_utc: string;
}

export interface AdminTeachersListResult {
  items: AdminTeacherRow[];
  counts: {
    total: number;
    active: number;
    invited: number;
    suspended: number;
  };
  schools: AdminSchoolRow[];
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
}

export interface AdminSchoolsListResult {
  items: AdminSchoolRow[];
  counts: {
    total: number;
    active: number;
    archived: number;
  };
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
}

const DEMO_SCHOOLS: AdminSchoolRow[] = [
  {
    id: "550e8400-e29b-41d4-a716-446655440001",
    name: "SDN 1 Kemiren",
    district_label: "Kec. Glagah, Banyuwangi",
    status: "active",
    active_teacher_count: 2,
    created_at_utc: "2026-03-10T02:00:00Z",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440002",
    name: "SDN 2 Glagah",
    district_label: "Kec. Glagah, Banyuwangi",
    status: "active",
    active_teacher_count: 1,
    created_at_utc: "2026-03-12T04:00:00Z",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440003",
    name: "SDN 4 Rogojampi",
    district_label: "Kec. Rogojampi, Banyuwangi",
    status: "archived",
    active_teacher_count: 0,
    created_at_utc: "2026-03-15T06:00:00Z",
  },
];

const DEMO_TEACHERS: AdminTeacherRow[] = [
  {
    user_id: "teacher-demo-1",
    display_name: "Ibu Sari",
    email: "ibu.sari@sdn1kemiren.sch.id",
    status: "active",
    schools: [
      {
        school_id: "550e8400-e29b-41d4-a716-446655440001",
        school_name: "SDN 1 Kemiren",
        district_label: "Kec. Glagah, Banyuwangi",
        link_status: "active",
        school_status: "active",
      },
    ],
    created_at_utc: "2026-03-11T03:00:00Z",
    updated_at_utc: "2026-04-01T07:00:00Z",
  },
  {
    user_id: "teacher-demo-2",
    display_name: "Bapak Budi",
    email: "pak.budi@sdn1kemiren.sch.id",
    status: "active",
    schools: [
      {
        school_id: "550e8400-e29b-41d4-a716-446655440001",
        school_name: "SDN 1 Kemiren",
        district_label: "Kec. Glagah, Banyuwangi",
        link_status: "active",
        school_status: "active",
      },
      {
        school_id: "550e8400-e29b-41d4-a716-446655440002",
        school_name: "SDN 2 Glagah",
        district_label: "Kec. Glagah, Banyuwangi",
        link_status: "active",
        school_status: "active",
      },
    ],
    created_at_utc: "2026-03-14T05:00:00Z",
    updated_at_utc: "2026-04-01T08:00:00Z",
  },
  {
    user_id: "teacher-demo-3",
    display_name: "Ibu Dewi",
    email: "ibu.dewi@sdn2glagah.sch.id",
    status: "invited",
    schools: [
      {
        school_id: "550e8400-e29b-41d4-a716-446655440002",
        school_name: "SDN 2 Glagah",
        district_label: "Kec. Glagah, Banyuwangi",
        link_status: "active",
        school_status: "active",
      },
    ],
    created_at_utc: "2026-04-02T02:00:00Z",
    updated_at_utc: "2026-04-02T02:00:00Z",
  },
  {
    user_id: "teacher-demo-4",
    display_name: "Bapak Anton",
    email: "pak.anton@sdn4rogojampi.sch.id",
    status: "suspended",
    schools: [
      {
        school_id: "550e8400-e29b-41d4-a716-446655440003",
        school_name: "SDN 4 Rogojampi",
        district_label: "Kec. Rogojampi, Banyuwangi",
        link_status: "inactive",
        school_status: "archived",
      },
    ],
    created_at_utc: "2026-03-16T07:00:00Z",
    updated_at_utc: "2026-04-02T04:00:00Z",
  },
];

function assertSupabasePeopleWriteReady(session: AdminSessionResult) {
  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    throw new DomainError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      "Mode demo lokal hanya menyediakan pratinjau baca-saja untuk Guru & Sekolah."
    );
  }
  const admin = createAdminSecretSupabaseClient();
  if (!admin || !session.userId || session.status !== "authenticated") {
    throw new DomainError(
      403,
      "ACTION_NOT_ALLOWED",
      "Sesi admin terverifikasi MFA serta SUPABASE_ADMIN_SECRET dibutuhkan untuk mengelola guru dan sekolah."
    );
  }
  return { admin, actorId: session.userId };
}

function revalidatePeoplePaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/guru");
  revalidatePath("/admin/sekolah");
  revalidatePath("/guru");
}

async function loadAuthEmailMapForAdmin(session: AdminSessionResult) {
  const emailMap = new Map<string, string>();
  if (session.status !== "authenticated" || !isSupabaseAdminConfigured()) {
    return emailMap;
  }
  const admin = createAdminSecretSupabaseClient();
  if (!admin) return emailMap;

  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error || !data?.users) break;
    for (const user of data.users) {
      if (user.email) {
        emailMap.set(user.id, user.email.toLowerCase());
      }
    }
    if (data.users.length < 100) break;
  }

  return emailMap;
}

function buildAdminSchoolRows(
  schoolRows: ReadonlyArray<{
    id: string;
    name: string;
    district_label: string;
    status: string;
    created_at: string;
  }>,
  linkRows: ReadonlyArray<{
    school_id: string;
    status: string;
  }>
): AdminSchoolRow[] {
  const activeCountBySchool = new Map<string, number>();
  for (const link of linkRows) {
    if (link.status !== "active") continue;
    activeCountBySchool.set(
      link.school_id,
      (activeCountBySchool.get(link.school_id) ?? 0) + 1
    );
  }

  return schoolRows.map((s) => ({
    id: s.id,
    name: s.name,
    district_label: s.district_label,
    status: (s.status === "archived" ? "archived" : "active") as SchoolStatus,
    active_teacher_count: activeCountBySchool.get(s.id) ?? 0,
    created_at_utc: s.created_at,
  }));
}

export async function listAdminSchoolsAsync(
  session: AdminSessionResult,
  filters?: {
    status?: SchoolStatus;
    q?: string;
  }
): Promise<AdminSchoolsListResult> {
  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    const qLower = (filters?.q ?? "").trim().toLowerCase();
    const filtered = DEMO_SCHOOLS.filter((s) => {
      if (filters?.status && s.status !== filters.status) return false;
      if (
        qLower &&
        !s.name.toLowerCase().includes(qLower) &&
        !s.district_label.toLowerCase().includes(qLower)
      ) {
        return false;
      }
      return true;
    });

    return {
      items: filtered,
      counts: {
        total: DEMO_SCHOOLS.length,
        active: DEMO_SCHOOLS.filter((s) => s.status === "active").length,
        archived: DEMO_SCHOOLS.filter((s) => s.status === "archived").length,
      },
      mode: "local_demo",
      migrationPending: false,
    };
  }

  const client = await createAdultSessionSupabaseClient();
  if (!client || session.status !== "authenticated") {
    return {
      items: [],
      counts: { total: 0, active: 0, archived: 0 },
      mode: "supabase",
      migrationPending: false,
    };
  }

  const [{ data: schoolRows, error: sErr }, { data: linkRows, error: lErr }] =
    await Promise.all([
      client
        .schema("app")
        .from("schools")
        .select("id, name, district_label, status, created_at")
        .order("name", { ascending: true }),
      client
        .schema("app")
        .from("teacher_schools")
        .select("school_id, teacher_id, status"),
    ]);

  if (sErr || lErr) {
    const err = sErr ?? lErr;
    if (err && isSupabaseSchemaNotReadyError(err)) {
      return {
        items: [],
        counts: { total: 0, active: 0, archived: 0 },
        mode: "supabase",
        migrationPending: true,
      };
    }
    throw new Error(`Gagal membaca daftar sekolah: ${err?.message ?? "unknown"}`);
  }

  const allSchools = buildAdminSchoolRows(schoolRows ?? [], linkRows ?? []);

  const qLower = (filters?.q ?? "").trim().toLowerCase();
  const filtered = allSchools.filter((s) => {
    if (filters?.status && s.status !== filters.status) return false;
    if (
      qLower &&
      !s.name.toLowerCase().includes(qLower) &&
      !s.district_label.toLowerCase().includes(qLower)
    ) {
      return false;
    }
    return true;
  });

  return {
    items: filtered,
    counts: {
      total: allSchools.length,
      active: allSchools.filter((s) => s.status === "active").length,
      archived: allSchools.filter((s) => s.status === "archived").length,
    },
    mode: "supabase",
    migrationPending: false,
  };
}

export async function listAdminTeachersAsync(
  session: AdminSessionResult,
  filters?: {
    status?: TeacherAccountStatus;
    school_id?: string;
    q?: string;
  }
): Promise<AdminTeachersListResult> {
  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    const qLower = (filters?.q ?? "").trim().toLowerCase();
    const filtered = DEMO_TEACHERS.filter((t) => {
      if (filters?.status && t.status !== filters.status) return false;
      if (
        filters?.school_id &&
        !t.schools.some(
          (s) => s.school_id === filters.school_id && s.link_status === "active"
        )
      ) {
        return false;
      }
      if (
        qLower &&
        !t.display_name.toLowerCase().includes(qLower) &&
        !(t.email ?? "").toLowerCase().includes(qLower)
      ) {
        return false;
      }
      return true;
    });

    return {
      items: filtered,
      counts: {
        total: DEMO_TEACHERS.length,
        active: DEMO_TEACHERS.filter((t) => t.status === "active").length,
        invited: DEMO_TEACHERS.filter((t) => t.status === "invited").length,
        suspended: DEMO_TEACHERS.filter((t) => t.status === "suspended").length,
      },
      schools: DEMO_SCHOOLS,
      mode: "local_demo",
      migrationPending: false,
    };
  }

  const client = await createAdultSessionSupabaseClient();
  if (!client || session.status !== "authenticated") {
    return {
      items: [],
      counts: { total: 0, active: 0, invited: 0, suspended: 0 },
      schools: [],
      mode: "supabase",
      migrationPending: false,
    };
  }

  const [
    { data: profiles, error: pErr },
    { data: links, error: lErr },
    { data: schoolRows, error: sErr },
    emailMap,
  ] = await Promise.all([
    client
      .schema("app")
      .from("profiles")
      .select("user_id, role, display_name, status, created_at, updated_at")
      .eq("role", "teacher")
      .order("created_at", { ascending: false }),
    client
      .schema("app")
      .from("teacher_schools")
      .select("teacher_id, school_id, status"),
    client
      .schema("app")
      .from("schools")
      .select("id, name, district_label, status, created_at")
      .order("name", { ascending: true }),
    loadAuthEmailMapForAdmin(session),
  ]);

  const queryErr = pErr ?? lErr ?? sErr;
  if (queryErr) {
    if (isSupabaseSchemaNotReadyError(queryErr)) {
      return {
        items: [],
        counts: { total: 0, active: 0, invited: 0, suspended: 0 },
        schools: [],
        mode: "supabase",
        migrationPending: true,
      };
    }
    throw new Error(
      `Gagal memuat daftar guru admin: ${queryErr.message ?? "unknown"}`
    );
  }

  const allSchools = buildAdminSchoolRows(schoolRows ?? [], links ?? []);
  const schoolMap = new Map(allSchools.map((s) => [s.id, s]));
  const linksByTeacher = new Map<string, AdminTeacherSchoolLink[]>();
  for (const link of links ?? []) {
    const school = schoolMap.get(link.school_id);
    if (!school) continue;
    const arr = linksByTeacher.get(link.teacher_id) ?? [];
    arr.push({
      school_id: school.id,
      school_name: school.name,
      district_label: school.district_label,
      link_status: (link.status === "inactive"
        ? "inactive"
        : "active") as TeacherSchoolLinkStatus,
      school_status: school.status,
    });
    linksByTeacher.set(link.teacher_id, arr);
  }

  const allTeachers: AdminTeacherRow[] = (profiles ?? []).map((p) => ({
    user_id: p.user_id,
    display_name: p.display_name,
    email: emailMap.get(p.user_id) ?? null,
    status: p.status as TeacherAccountStatus,
    schools: linksByTeacher.get(p.user_id) ?? [],
    created_at_utc: p.created_at,
    updated_at_utc: p.updated_at,
  }));

  const qLower = (filters?.q ?? "").trim().toLowerCase();
  const filtered = allTeachers.filter((t) => {
    if (filters?.status && t.status !== filters.status) return false;
    if (
      filters?.school_id &&
      !t.schools.some(
        (s) => s.school_id === filters.school_id && s.link_status === "active"
      )
    ) {
      return false;
    }
    if (
      qLower &&
      !t.display_name.toLowerCase().includes(qLower) &&
      !(t.email ?? "").toLowerCase().includes(qLower)
    ) {
      return false;
    }
    return true;
  });

  return {
    items: filtered,
    counts: {
      total: allTeachers.length,
      active: allTeachers.filter((t) => t.status === "active").length,
      invited: allTeachers.filter((t) => t.status === "invited").length,
      suspended: allTeachers.filter((t) => t.status === "suspended").length,
    },
    schools: allSchools,
    mode: "supabase",
    migrationPending: false,
  };
}

export async function inviteTeacherAsync(
  session: AdminSessionResult,
  input: {
    email: string;
    display_name: string;
    school_ids: string[];
    requestId: string;
  }
) {
  const { admin, actorId } = assertSupabasePeopleWriteReady(session);
  const publicAppUrl = getServerEnv().PUBLIC_APP_URL.replace(/\/+$/, "");
  const redirectTo = `${publicAppUrl}/auth/callback?next=/auth/aktivasi`;

  let targetUserId = "";
  let inviteSent = false;

  const { data: inviteData, error: inviteErr } =
    await admin.auth.admin.inviteUserByEmail(input.email, {
      redirectTo,
      data: { display_name: input.display_name },
    });

  if (!inviteErr && inviteData?.user?.id) {
    targetUserId = inviteData.user.id;
    inviteSent = true;
  } else {
    for (let page = 1; page <= 10 && !targetUserId; page += 1) {
      const { data: listData, error: listErr } =
        await admin.auth.admin.listUsers({
          page,
          perPage: 100,
        });
      if (listErr) break;
      const found = (listData?.users ?? []).find(
        (u) => (u.email ?? "").toLowerCase() === input.email
      );
      if (found) {
        targetUserId = found.id;
        break;
      }
      if (!listData?.users || listData.users.length < 100) break;
    }

    if (!targetUserId) {
      logServerEvent({
        request_id: input.requestId,
        route: "/api/v1/admin/teachers",
        action: "invite_teacher",
        outcome: "error",
        status: 503,
        metadata: { reason: inviteErr?.message ?? "auth_invite_failed" },
      });
      throw new DomainError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        `Gagal mengirim undangan Supabase Auth: ${inviteErr?.message ?? "periksa konfigurasi SMTP"}`
      );
    }
  }

  const { data, error } = await admin
    .schema("api")
    .rpc("register_teacher_profile", {
      p_actor_id: actorId,
      p_user_id: targetUserId,
      p_display_name: input.display_name,
      p_status: "invited",
      p_school_ids: input.school_ids,
      p_request_id: input.requestId,
    });

  if (error) {
    throw mapAdminPeoplePostgresError(error) ?? new Error(error.message);
  }

  revalidatePeoplePaths();
  return {
    profile: data,
    invite_sent: inviteSent,
  };
}

export async function updateTeacherProfileAsync(
  session: AdminSessionResult,
  input: {
    teacherId: string;
    display_name: string;
    requestId: string;
  }
) {
  const { admin, actorId } = assertSupabasePeopleWriteReady(session);

  const { data, error } = await admin
    .schema("api")
    .rpc("update_teacher_profile", {
      p_actor_id: actorId,
      p_teacher_id: input.teacherId,
      p_display_name: input.display_name,
      p_request_id: input.requestId,
    });

  if (error) {
    throw mapAdminPeoplePostgresError(error) ?? new Error(error.message);
  }

  revalidatePeoplePaths();
  return data;
}

export async function setTeacherStatusAsync(
  session: AdminSessionResult,
  input: {
    teacherId: string;
    status: "active" | "suspended";
    reason?: string | null;
    requestId: string;
  }
) {
  const { admin, actorId } = assertSupabasePeopleWriteReady(session);

  const { data, error } = await admin.schema("api").rpc("set_teacher_status", {
    p_actor_id: actorId,
    p_teacher_id: input.teacherId,
    p_status: input.status,
    p_reason: input.reason ?? null,
    p_request_id: input.requestId,
  });

  if (error) {
    throw mapAdminPeoplePostgresError(error) ?? new Error(error.message);
  }

  // Nonaktifkan atau buka kembali sesi Auth Supabase seketika
  let authBanSynced = true;
  const { error: authErr } = await admin.auth.admin.updateUserById(
    input.teacherId,
    {
      ban_duration: input.status === "suspended" ? "876000h" : "none",
    }
  );

  if (authErr) {
    authBanSynced = false;
    logServerEvent({
      request_id: input.requestId || createRequestId(),
      route: "/api/v1/admin/teachers/[id]/status",
      action: "sync_teacher_auth_ban",
      outcome: "error",
      status: 200,
      metadata: {
        teacher_id: input.teacherId,
        target_status: input.status,
        error_message: authErr.message,
      },
    });
  }

  revalidatePeoplePaths();
  return {
    ...(data as Record<string, unknown>),
    auth_ban_synced: authBanSynced,
  };
}

export async function setTeacherSchoolLinkAsync(
  session: AdminSessionResult,
  input: {
    teacherId: string;
    schoolId: string;
    status: TeacherSchoolLinkStatus;
    requestId: string;
  }
) {
  const { admin, actorId } = assertSupabasePeopleWriteReady(session);

  const { data, error } = await admin
    .schema("api")
    .rpc("set_teacher_school_link", {
      p_actor_id: actorId,
      p_teacher_id: input.teacherId,
      p_school_id: input.schoolId,
      p_status: input.status,
      p_request_id: input.requestId,
    });

  if (error) {
    throw mapAdminPeoplePostgresError(error) ?? new Error(error.message);
  }

  revalidatePeoplePaths();
  return data;
}

export async function createSchoolAsync(
  session: AdminSessionResult,
  input: {
    name: string;
    district_label: string;
    requestId: string;
  }
) {
  const { admin, actorId } = assertSupabasePeopleWriteReady(session);

  const { data, error } = await admin.schema("api").rpc("create_school", {
    p_actor_id: actorId,
    p_name: input.name,
    p_district_label: input.district_label,
    p_request_id: input.requestId,
  });

  if (error) {
    throw mapAdminPeoplePostgresError(error) ?? new Error(error.message);
  }

  revalidatePeoplePaths();
  return data;
}

export async function updateSchoolAsync(
  session: AdminSessionResult,
  input: {
    schoolId: string;
    name: string;
    district_label: string;
    status: SchoolStatus;
    requestId: string;
  }
) {
  const { admin, actorId } = assertSupabasePeopleWriteReady(session);

  const { data, error } = await admin.schema("api").rpc("update_school", {
    p_actor_id: actorId,
    p_school_id: input.schoolId,
    p_name: input.name,
    p_district_label: input.district_label,
    p_status: input.status,
    p_request_id: input.requestId,
  });

  if (error) {
    throw mapAdminPeoplePostgresError(error) ?? new Error(error.message);
  }

  revalidatePeoplePaths();
  return data;
}
