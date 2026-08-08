import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const {
    enabled,
    telegramUrl,
    supportUrl,
    welcomeTitle,
    welcomeIntro,
    buyInstructions,
    smsCostsText,
  } = await request.json();

  if (!welcomeTitle || !welcomeIntro || !buyInstructions || !smsCostsText) {
    return NextResponse.json({ error: "Title and all text fields are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("onboarding_config")
    .update({
      enabled: Boolean(enabled),
      telegram_url: telegramUrl || null,
      support_url: supportUrl || null,
      welcome_title: welcomeTitle,
      welcome_intro: welcomeIntro,
      buy_instructions: buyInstructions,
      sms_costs_text: smsCostsText,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Could not save settings" }, { status: 500 });

  return NextResponse.json({ config: updated });
}
