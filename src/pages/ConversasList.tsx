import { ConversasSidebar } from "@/components/ConversasSidebar";

/**
 * Página /  — usada apenas no mobile (no desktop a lista vive no sidebar do AppShell).
 */
export default function ConversasList() {
  return (
    <div className="h-full md:hidden">
      <ConversasSidebar />
    </div>
  );
}
