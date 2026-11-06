import { tr, localized } from '../../../../shared/i18n'
﻿import type { AutomationScriptRecord } from "../../automationScripts";

const PROTON_MAIL_FIRST_MESSAGE_SCRIPT_ID = "proton-mail-first-message";

export interface ScriptParamFieldDoc {
  name: string;
  description: string;
  defaultValue?: string;
  note?: string;
}

export interface ScriptParamsHelpContent {
  title: string;
  summary: string;
  docs: ScriptParamFieldDoc[];
}

const PROTON_MAIL_PARAMS_HELP: ScriptParamsHelpContent = localized(() => ({
  title: tr("browser.pages.automationScriptDetail.paramsHelp.title.0199434"),
  summary: tr("browser.pages.automationScriptDetail.paramsHelp.summary.0e26c6e"),
  docs: [
    {
      name: "searchQuery",
      description:
        tr("browser.pages.automationScriptDetail.paramsHelp.description.ed2dc3d"),
      defaultValue: "OpenAI, ChatGPT",
      note: tr("browser.pages.automationScriptDetail.paramsHelp.note.de01d87"),
    },
    {
      name: "recipient",
      description: tr("browser.pages.automationScriptDetail.paramsHelp.description.4a2e23a"),
      defaultValue: "",
      note: tr("browser.pages.automationScriptDetail.paramsHelp.note.3576ecd"),
    },
    {
      name: "senderEmail",
      description:
        tr("browser.pages.automationScriptDetail.paramsHelp.description.afa1616"),
      defaultValue: "otp@tm1.openai.com, noreply@tm.openai.com",
    },
    {
      name: "inboxUrl",
      description: tr("browser.pages.automationScriptDetail.paramsHelp.description.4344719"),
      defaultValue: "https://mail.proton.me/u/0/inbox",
    },
    {
      name: "timeoutMs",
      description: tr("browser.pages.automationScriptDetail.paramsHelp.description.f00455d"),
      defaultValue: "90000",
    },
    {
      name: "maxBodyChars",
      description: tr("browser.pages.automationScriptDetail.paramsHelp.description.68184f6"),
      defaultValue: "12000",
    },
  ],
}));


export function getScriptParamsHelp(
  script: AutomationScriptRecord,
): ScriptParamsHelpContent | null {
  if (script.id === PROTON_MAIL_FIRST_MESSAGE_SCRIPT_ID) {
    return PROTON_MAIL_PARAMS_HELP;
  }
  return null;
}
