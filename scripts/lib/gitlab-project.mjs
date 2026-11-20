export const GITLAB_DELIVERY_BASE_URL = "https://gitlab.saurick.me";
export const GITLAB_DELIVERY_PROJECT = "saurick/plush-toy-erp";

// GitLab exposes Git over HTTPS and the registered LAN SSH listener.
export const GITLAB_DELIVERY_SSH_URL = "ssh://git@192.168.0.133:2224";

export function isGitlabDeliveryPushLocation(location) {
  const repository = location.replace(/\.git$/u, "");
  return [GITLAB_DELIVERY_BASE_URL, GITLAB_DELIVERY_SSH_URL]
    .some((base) => repository === `${base}/${GITLAB_DELIVERY_PROJECT}`);
}
