import type {
  Identifier,
  SafeInstallation,
  SafeKeyPackageStatus,
} from "@xmtp/browser-sdk";
import { useEffect, useState } from "react";
import { useXMTP } from "@/contexts/XMTPContext";

export const useIdentity = (syncOnMount: boolean = false) => {
  const { client } = useXMTP();
  const [syncing, setSyncing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [inboxId, setInboxId] = useState<string | null>(null);
  const [recoveryIdentifier, setRecoveryIdentifier] =
    useState<Identifier | null>(null);
  const [accountIdentifiers, setAccountIdentifiers] = useState<Identifier[]>(
    [],
  );
  const [installations, setInstallations] = useState<SafeInstallation[]>([]);
  const [keyPackageStatuses, setKeyPackageStatuses] = useState<
    [string, SafeKeyPackageStatus][]
  >([]);

  useEffect(() => {
    if (syncOnMount) {
      void sync();
    }
  }, []);

  const sync = async () => {
    if (!client) {
      return;
    }

    setSyncing(true);

    try {
      const inboxState = await client.preferences.inboxState(true);
      setInboxId(inboxState.inboxId);
      setAccountIdentifiers(inboxState.accountIdentifiers);
      setRecoveryIdentifier(inboxState.recoveryIdentifier);
      const installations = inboxState.installations
        .filter((installation) => installation.id !== client.installationId)
        .sort((a, b) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          if (a.clientTimestampNs! > b.clientTimestampNs!) {
            return -1;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          } else if (a.clientTimestampNs! < b.clientTimestampNs!) {
            return 1;
          }
          return 0;
        });
      setInstallations(installations);
      const keyPackageStatuses =
        await client.getKeyPackageStatusesForInstallationIds(
          installations.map((installation) => installation.id),
        );
      setKeyPackageStatuses(
        Array.from(keyPackageStatuses.entries()).sort((a, b) => {
          if (
            Number(a[1].lifetime?.notAfter ?? 0n) >
            Number(b[1].lifetime?.notAfter ?? 0n)
          ) {
            return -1;
          } else if (
            Number(a[1].lifetime?.notAfter ?? 0n) <
            Number(b[1].lifetime?.notAfter ?? 0n)
          ) {
            return 1;
          }
          return 0;
        }),
      );
    } finally {
      setSyncing(false);
    }
  };

  const revokeInstallation = async (installationIdBytes: Uint8Array) => {
    if (!client) {
      return;
    }

    setRevoking(true);

    try {
      await client.revokeInstallations([installationIdBytes]);
    } finally {
      setRevoking(false);
    }
  };

  const revokeAllOtherInstallations = async () => {
    if (!client) {
      return;
    }

    setRevoking(true);

    try {
      await client.revokeAllOtherInstallations();
    } finally {
      setRevoking(false);
    }
  };

  return {
    accountIdentifiers,
    inboxId,
    installations,
    keyPackageStatuses,
    recoveryIdentifier,
    revokeAllOtherInstallations,
    revokeInstallation,
    revoking,
    sync,
    syncing,
  };
};
