import { CreateWorkbench } from "@/components/create-workbench";
import { PROMPT_EXAMPLES } from "@/lib/examples";

export default function HomePage() {
  return <CreateWorkbench examples={PROMPT_EXAMPLES} />;
}
