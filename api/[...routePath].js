import accessCheckin from "../serverless-handlers/access-checkin.js";
import applyDiscipline from "../serverless-handlers/apply-discipline.js";
import clientError from "../serverless-handlers/client-error.js";
import config from "../serverless-handlers/config.js";
import disciplineAppeal from "../serverless-handlers/discipline-appeal.js";
import dkProxy from "../serverless-handlers/dk-proxy.js";
import flappySession from "../serverless-handlers/flappy-session.js";
import inviteMember from "../serverless-handlers/invite-member.js";
import manageInvestigation from "../serverless-handlers/manage-investigation.js";
import manageMember from "../serverless-handlers/manage-member.js";
import push from "../serverless-handlers/push.js";
import restoreSuspensions from "../serverless-handlers/restore-suspensions.js";
import reviewApplication from "../serverless-handlers/review-application.js";
import reviewComplaint from "../serverless-handlers/review-complaint.js";

const handlers = Object.freeze({
  "access-checkin": accessCheckin,
  "apply-discipline": applyDiscipline,
  "client-error": clientError,
  config,
  "discipline-appeal": disciplineAppeal,
  "dk-proxy": dkProxy,
  "flappy-session": flappySession,
  "invite-member": inviteMember,
  "manage-investigation": manageInvestigation,
  "manage-member": manageMember,
  push,
  "restore-suspensions": restoreSuspensions,
  "review-application": reviewApplication,
  "review-complaint": reviewComplaint
});

function resolveRoute(request) {
  const routeParam = request?.query?.routePath;
  if (Array.isArray(routeParam)) return routeParam.join("/");
  if (typeof routeParam === "string" && routeParam.trim()) return routeParam.trim();

  try {
    return new URL(request?.url || "/", "https://ihp.org.tr")
      .pathname
      .replace(/^\/api\/?/, "")
      .replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export default async function apiRouter(request, response) {
  const routeHandler = handlers[resolveRoute(request)];

  if (!routeHandler) {
    response.status(404).json({ error: "API endpoint not found." });
    return;
  }

  return routeHandler(request, response);
}
