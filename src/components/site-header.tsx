import Link from "next/link";

import { AuthHeaderControl } from "@/components/auth-header-control";
import { ResourceUpdateControl } from "@/components/resource-update-control";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        <em>Text-to-</em>CAD<span className="brand-dot">.</span>
      </Link>
      <span className="header-spacer" />
      <ResourceUpdateControl />
      <AuthHeaderControl />
    </header>
  );
}
