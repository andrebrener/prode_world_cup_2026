import JoinForm from "@/components/JoinForm";
import CreatePoolForm from "@/components/CreatePoolForm";
import { getParticipantId } from "@/lib/session";
import { getParticipant } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function CrearPage() {
  const id = await getParticipantId();
  const participant = id ? await getParticipant(id) : null;

  if (!participant) {
    return (
      <JoinForm
        title={
          <>
            Primero, tu <span className="text-primary">nombre</span>
          </>
        }
        subtitle="Necesitamos tu nombre para crear el prode a tu nombre."
      />
    );
  }

  return <CreatePoolForm />;
}
