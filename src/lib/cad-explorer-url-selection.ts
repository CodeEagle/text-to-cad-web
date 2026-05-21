type CadExplorerUrls = {
  url?: string;
  embedUrl?: string;
};

export function selectCadExplorerUrls(explorer: CadExplorerUrls): { frameUrl: string; openUrl: string } {
  const fullUrl = explorer.url ?? "";
  const embeddedUrl = explorer.embedUrl ?? "";
  return {
    frameUrl: embeddedUrl || fullUrl,
    openUrl: fullUrl || embeddedUrl
  };
}
