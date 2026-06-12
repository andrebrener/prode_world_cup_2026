import { getParticipantId } from "@/lib/session";
import { getParticipant } from "@/lib/db/queries";
import JoinForm from "@/components/JoinForm";
import ProfileForm from "@/components/ProfileForm";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const id = await getParticipantId();
  const participant = id ? await getParticipant(id) : null;

  if (!participant) {
    return (
      <JoinForm
        title={
          <>
            Entrá a tu <span className="text-primary">perfil</span>
          </>
        }
        subtitle="Poné tu nombre para empezar. Después podés agregar tu foto."
      />
    );
  }

  return (
    <ProfileForm
      currentName={participant.name}
      currentAvatar={participant.avatar ?? null}
      currentEmail={participant.email ?? null}
    />
  );
}
