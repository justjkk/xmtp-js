import {
  Badge,
  Button,
  FocusTrap,
  Group,
  LoadingOverlay,
  Modal,
  NativeSelect,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  GroupPermissionsOptions,
  MetadataField,
  PermissionPolicy,
  PermissionUpdateType,
  type ConsentState,
  type PermissionPolicySet,
  type SafeGroupMember,
  type Group as XmtpGroup,
} from "@xmtp/browser-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useXMTP } from "@/contexts/XMTPContext";
import { isValidLongWalletAddress } from "@/helpers/address";
import { useBodyClass } from "@/hooks/useBodyClass";
import { BadgeWithCopy } from "../BadgeWithCopy";

type AnyFn = (...args: unknown[]) => unknown;
type ClassProperties<C> = {
  [K in keyof C as C[K] extends AnyFn ? never : K]: C[K];
};
type PolicySet = ClassProperties<PermissionPolicySet>;

const defaultPolicySet: PolicySet = {
  addAdminPolicy: PermissionPolicy.SuperAdmin,
  addMemberPolicy: PermissionPolicy.Allow,
  removeAdminPolicy: PermissionPolicy.SuperAdmin,
  removeMemberPolicy: PermissionPolicy.Admin,
  updateGroupNamePolicy: PermissionPolicy.Allow,
  updateGroupDescriptionPolicy: PermissionPolicy.Allow,
  updateGroupImageUrlSquarePolicy: PermissionPolicy.Allow,
  updateMessageDisappearingPolicy: PermissionPolicy.Admin,
};

const adminPolicySet: PolicySet = {
  addAdminPolicy: PermissionPolicy.SuperAdmin,
  addMemberPolicy: PermissionPolicy.Admin,
  removeAdminPolicy: PermissionPolicy.SuperAdmin,
  removeMemberPolicy: PermissionPolicy.Admin,
  updateGroupNamePolicy: PermissionPolicy.Admin,
  updateGroupDescriptionPolicy: PermissionPolicy.Admin,
  updateGroupImageUrlSquarePolicy: PermissionPolicy.Admin,
  updateMessageDisappearingPolicy: PermissionPolicy.Admin,
};

export type ManageGroupProps = {
  group: XmtpGroup;
};

export const ManageGroup: React.FC<ManageGroupProps> = ({ group }) => {
  useBodyClass("main-flex-layout");
  const { client } = useXMTP();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState<string | null>(null);
  const [members, setMembers] = useState<SafeGroupMember[]>([]);
  const [addedMembers, setAddedMembers] = useState<string[]>([]);
  const [removedMembers, setRemovedMembers] = useState<SafeGroupMember[]>([]);
  const [permissionsPolicy, setPermissionsPolicy] =
    useState<GroupPermissionsOptions>(GroupPermissionsOptions.Default);
  const [policySet, setPolicySet] = useState<PolicySet>(defaultPolicySet);
  const [updateConversationError, setUpdateConversationError] = useState<
    string | null
  >(null);
  const consentStateRef = useRef<ConsentState>(0);
  const [consentState, setConsentState] = useState<ConsentState>(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const policyTooltip = useMemo(() => {
    if (permissionsPolicy === GroupPermissionsOptions.Default) {
      return "All members of the group can perform group actions";
    } else if (permissionsPolicy === GroupPermissionsOptions.AdminOnly) {
      return "Only admins can perform group actions";
    }
    return "Custom policy as defined below";
  }, [permissionsPolicy]);

  useEffect(() => {
    if (
      permissionsPolicy === GroupPermissionsOptions.Default ||
      permissionsPolicy === GroupPermissionsOptions.CustomPolicy
    ) {
      setPolicySet(defaultPolicySet);
    } else {
      setPolicySet(adminPolicySet);
    }
  }, [permissionsPolicy]);

  useEffect(() => {
    if (
      members.some((member) =>
        member.accountIdentifiers.some(
          (identifier) =>
            identifier.identifier.toLowerCase() === address.toLowerCase(),
        ),
      )
    ) {
      setAddressError("Duplicate address");
    } else if (address && !isValidLongWalletAddress(address)) {
      setAddressError("Invalid address");
    } else {
      setAddressError(null);
    }
  }, [members, address]);

  const handleUpdate = async () => {
    if (!client) {
      setUpdateConversationError("Client not initialized");
      return;
    }
    setIsLoading(true);
    try {
      if (name !== group.name) {
        await group.updateName(name);
      }
      if (description !== group.description) {
        await group.updateDescription(description);
      }
      if (imageUrl !== group.imageUrl) {
        await group.updateImageUrl(imageUrl);
      }
      if (addedMembers.length > 0) {
        await group.addMembersByIdentifiers(
          addedMembers.map((member) => ({
            identifier: member.toLowerCase(),
            identifierKind: "Ethereum",
          })),
        );
      }
      if (removedMembers.length > 0) {
        await group.removeMembers(
          removedMembers.map((member) => member.inboxId),
        );
      }

      if (consentState !== consentStateRef.current) {
        await group.updateConsentState(consentState);
      }

      const permissions = await group.permissions();
      if (
        permissions.policyType !== permissionsPolicy &&
        permissionsPolicy !== GroupPermissionsOptions.CustomPolicy
      ) {
        switch (permissionsPolicy) {
          case GroupPermissionsOptions.Default: {
            await group.updatePermission(
              PermissionUpdateType.AddMember,
              defaultPolicySet.addMemberPolicy,
            );
            await group.updatePermission(
              PermissionUpdateType.RemoveMember,
              defaultPolicySet.removeMemberPolicy,
            );
            await group.updatePermission(
              PermissionUpdateType.AddAdmin,
              defaultPolicySet.addAdminPolicy,
            );
            await group.updatePermission(
              PermissionUpdateType.RemoveAdmin,
              defaultPolicySet.removeAdminPolicy,
            );
            await group.updatePermission(
              PermissionUpdateType.UpdateMetadata,
              defaultPolicySet.updateGroupNamePolicy,
              MetadataField.GroupName,
            );
            await group.updatePermission(
              PermissionUpdateType.UpdateMetadata,
              defaultPolicySet.updateGroupDescriptionPolicy,
              MetadataField.Description,
            );
            await group.updatePermission(
              PermissionUpdateType.UpdateMetadata,
              defaultPolicySet.updateGroupImageUrlSquarePolicy,
              MetadataField.ImageUrlSquare,
            );
            break;
          }
          case GroupPermissionsOptions.AdminOnly: {
            await group.updatePermission(
              PermissionUpdateType.AddMember,
              adminPolicySet.addMemberPolicy,
            );
            await group.updatePermission(
              PermissionUpdateType.RemoveMember,
              adminPolicySet.removeMemberPolicy,
            );
            await group.updatePermission(
              PermissionUpdateType.AddAdmin,
              adminPolicySet.addAdminPolicy,
            );
            await group.updatePermission(
              PermissionUpdateType.RemoveAdmin,
              adminPolicySet.removeAdminPolicy,
            );
            await group.updatePermission(
              PermissionUpdateType.UpdateMetadata,
              adminPolicySet.updateGroupNamePolicy,
              MetadataField.GroupName,
            );
            await group.updatePermission(
              PermissionUpdateType.UpdateMetadata,
              adminPolicySet.updateGroupDescriptionPolicy,
              MetadataField.Description,
            );
            await group.updatePermission(
              PermissionUpdateType.UpdateMetadata,
              adminPolicySet.updateGroupImageUrlSquarePolicy,
              MetadataField.ImageUrlSquare,
            );
          }
        }
      }
      if (permissionsPolicy === GroupPermissionsOptions.CustomPolicy) {
        await group.updatePermission(
          PermissionUpdateType.AddMember,
          policySet.addMemberPolicy,
        );
        await group.updatePermission(
          PermissionUpdateType.RemoveMember,
          policySet.removeMemberPolicy,
        );
        await group.updatePermission(
          PermissionUpdateType.AddAdmin,
          policySet.addAdminPolicy,
        );
        await group.updatePermission(
          PermissionUpdateType.RemoveAdmin,
          policySet.removeAdminPolicy,
        );
        await group.updatePermission(
          PermissionUpdateType.UpdateMetadata,
          policySet.updateGroupNamePolicy,
          MetadataField.GroupName,
        );
        await group.updatePermission(
          PermissionUpdateType.UpdateMetadata,
          policySet.updateGroupDescriptionPolicy,
          MetadataField.Description,
        );
        await group.updatePermission(
          PermissionUpdateType.UpdateMetadata,
          policySet.updateGroupImageUrlSquarePolicy,
          MetadataField.ImageUrlSquare,
        );
      }
      void navigate(`/conversations/${group.id}`);
    } catch (error) {
      setUpdateConversationError(
        `Failed to update conversation: ${error as Error}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddMember = () => {
    setAddedMembers([...addedMembers, address.toLowerCase()]);
    setAddress("");
    setAddressError(null);
  };

  useEffect(() => {
    const loadGroup = async () => {
      setName(group.name ?? "");
      setDescription(group.description ?? "");
      setImageUrl(group.imageUrl ?? "");
      const consentState = await group.consentState();
      setConsentState(consentState);
      consentStateRef.current = consentState;
      const members = await group.members();
      setMembers(members);
      const permissions = await group.permissions();
      const policyType = permissions.policyType;
      switch (policyType) {
        case GroupPermissionsOptions.Default:
          setPermissionsPolicy(GroupPermissionsOptions.Default);
          setPolicySet(defaultPolicySet);
          break;
        case GroupPermissionsOptions.AdminOnly:
          setPermissionsPolicy(GroupPermissionsOptions.AdminOnly);
          setPolicySet(adminPolicySet);
          break;
        case GroupPermissionsOptions.CustomPolicy:
          setPermissionsPolicy(GroupPermissionsOptions.CustomPolicy);
          setPolicySet(permissions.policySet);
          break;
      }
    };
    void loadGroup();
  }, [group.id]);

  return (
    <>
      {updateConversationError && (
        <Modal
          opened={!!updateConversationError}
          onClose={() => {
            setUpdateConversationError(null);
          }}
          withCloseButton={false}
          centered>
          <Stack gap="md">
            <Title order={4}>Error</Title>
            <Text>{updateConversationError}</Text>
            <Group justify="flex-end">
              <Button
                onClick={() => {
                  setUpdateConversationError(null);
                }}>
                OK
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
      <FocusTrap>
        <Stack
          gap="lg"
          p="md"
          pos="relative"
          flex={1}
          style={{
            overflow: "hidden",
            margin: "calc(var(--mantine-spacing-md) * -1)",
          }}>
          <LoadingOverlay visible={isLoading} />
          <Title order={3} c={group.name !== "" ? undefined : "dimmed"}>
            {group.name || "Untitled"}
          </Title>
          <ScrollArea type="scroll" className="scrollfade">
            <Stack gap="lg" py="md">
              {group.metadata?.conversationType !== "dm" && (
                <Paper p="md" radius="md" withBorder>
                  <Stack gap="md">
                    <Title order={4}>Properties</Title>
                    <Group gap="md" align="center" wrap="nowrap">
                      <Text flex="1 1 40%">Name</Text>
                      <TextInput
                        size="md"
                        flex="1 1 60%"
                        value={name}
                        onChange={(event) => {
                          setName(event.target.value);
                        }}
                      />
                    </Group>
                    <Group gap="md" align="flex-start" wrap="nowrap">
                      <Text flex="1 1 40%">Description</Text>
                      <Textarea
                        size="md"
                        flex="1 1 60%"
                        value={description}
                        onChange={(event) => {
                          setDescription(event.target.value);
                        }}
                      />
                    </Group>
                    <Group gap="md" align="center" wrap="nowrap">
                      <Text flex="1 1 40%">Image URL</Text>
                      <TextInput
                        size="md"
                        flex="1 1 60%"
                        value={imageUrl}
                        onChange={(event) => {
                          setImageUrl(event.target.value);
                        }}
                      />
                    </Group>
                  </Stack>
                </Paper>
              )}
              <Paper p="md" radius="md" withBorder>
                <Stack gap="md">
                  <Title order={4}>Consent</Title>
                  <Group gap="md" align="center" wrap="nowrap">
                    <Text flex="1 1 40%">Consent state</Text>
                    <NativeSelect
                      size="md"
                      flex="1 1 60%"
                      value={consentState}
                      onChange={(event) => {
                        setConsentState(
                          parseInt(
                            event.currentTarget.value,
                            10,
                          ) as ConsentState,
                        );
                      }}
                      data={[
                        { value: "0", label: "Unknown" },
                        { value: "1", label: "Allowed" },
                        { value: "2", label: "Denied" },
                      ]}
                    />
                  </Group>
                </Stack>
              </Paper>
              <Paper p="md" radius="md" withBorder>
                <Stack gap="md">
                  <Group gap="md" justify="space-between">
                    <Title order={4}>Permissions</Title>
                    <Group gap="xs">
                      <Text>Policy</Text>
                      <Tooltip withArrow label={policyTooltip}>
                        <NativeSelect
                          disabled={group.metadata?.conversationType === "dm"}
                          value={permissionsPolicy}
                          onChange={(event) => {
                            setPermissionsPolicy(
                              parseInt(
                                event.currentTarget.value,
                                10,
                              ) as GroupPermissionsOptions,
                            );
                          }}
                          data={[
                            { value: "0", label: "Default" },
                            { value: "1", label: "Admins only" },
                            { value: "2", label: "Custom policy" },
                          ]}
                        />
                      </Tooltip>
                    </Group>
                  </Group>
                  <Group gap="md" justify="space-between" align="center">
                    <Text>Add members</Text>
                    <NativeSelect
                      disabled={
                        group.metadata?.conversationType === "dm" ||
                        permissionsPolicy !==
                          GroupPermissionsOptions.CustomPolicy
                      }
                      value={policySet.addMemberPolicy}
                      onChange={(event) => {
                        setPolicySet({
                          ...policySet,
                          addMemberPolicy: parseInt(
                            event.currentTarget.value,
                            10,
                          ) as PermissionPolicy,
                        });
                      }}
                      data={[
                        { value: "1", label: "Disabled" },
                        { value: "2", label: "Admins only" },
                        { value: "3", label: "Super admins only" },
                      ]}
                    />
                  </Group>
                  <Group gap="md" justify="space-between" align="center">
                    <Text>Remove members</Text>
                    <NativeSelect
                      disabled={
                        group.metadata?.conversationType === "dm" ||
                        permissionsPolicy !==
                          GroupPermissionsOptions.CustomPolicy
                      }
                      value={policySet.removeMemberPolicy}
                      onChange={(event) => {
                        setPolicySet({
                          ...policySet,
                          removeMemberPolicy: parseInt(
                            event.currentTarget.value,
                            10,
                          ) as PermissionPolicy,
                        });
                      }}
                      data={[
                        { value: "1", label: "Disabled" },
                        { value: "2", label: "Admins only" },
                        { value: "3", label: "Super admins only" },
                      ]}
                    />
                  </Group>
                  <Group gap="md" justify="space-between" align="center">
                    <Text>Add admins</Text>
                    <NativeSelect
                      disabled={
                        group.metadata?.conversationType === "dm" ||
                        permissionsPolicy !==
                          GroupPermissionsOptions.CustomPolicy
                      }
                      value={policySet.addAdminPolicy}
                      onChange={(event) => {
                        setPolicySet({
                          ...policySet,
                          addAdminPolicy: parseInt(
                            event.currentTarget.value,
                            10,
                          ) as PermissionPolicy,
                        });
                      }}
                      data={[
                        { value: "1", label: "Disabled" },
                        { value: "2", label: "Admins only" },
                        { value: "3", label: "Super admins only" },
                      ]}
                    />
                  </Group>
                  <Group gap="md" justify="space-between" align="center">
                    <Text>Remove admins</Text>
                    <NativeSelect
                      disabled={
                        group.metadata?.conversationType === "dm" ||
                        permissionsPolicy !==
                          GroupPermissionsOptions.CustomPolicy
                      }
                      value={policySet.removeAdminPolicy}
                      onChange={(event) => {
                        setPolicySet({
                          ...policySet,
                          removeAdminPolicy: parseInt(
                            event.currentTarget.value,
                            10,
                          ) as PermissionPolicy,
                        });
                      }}
                      data={[
                        { value: "1", label: "Disabled" },
                        { value: "2", label: "Admins only" },
                        { value: "3", label: "Super admins only" },
                      ]}
                    />
                  </Group>
                  <Group gap="md" justify="space-between" align="center">
                    <Text>Update group name</Text>
                    <NativeSelect
                      disabled={
                        group.metadata?.conversationType === "dm" ||
                        permissionsPolicy !==
                          GroupPermissionsOptions.CustomPolicy
                      }
                      value={policySet.updateGroupNamePolicy}
                      onChange={(event) => {
                        setPolicySet({
                          ...policySet,
                          updateGroupNamePolicy: parseInt(
                            event.currentTarget.value,
                            10,
                          ) as PermissionPolicy,
                        });
                      }}
                      data={[
                        { value: "0", label: "Everyone" },
                        { value: "1", label: "Disabled" },
                        { value: "2", label: "Admins only" },
                        { value: "3", label: "Super admins only" },
                      ]}
                    />
                  </Group>
                  <Group gap="md" justify="space-between" align="center">
                    <Text>Update group description</Text>
                    <NativeSelect
                      disabled={
                        group.metadata?.conversationType === "dm" ||
                        permissionsPolicy !==
                          GroupPermissionsOptions.CustomPolicy
                      }
                      value={policySet.updateGroupDescriptionPolicy}
                      onChange={(event) => {
                        setPolicySet({
                          ...policySet,
                          updateGroupDescriptionPolicy: parseInt(
                            event.currentTarget.value,
                            10,
                          ) as PermissionPolicy,
                        });
                      }}
                      data={[
                        { value: "0", label: "Everyone" },
                        { value: "1", label: "Disabled" },
                        { value: "2", label: "Admins only" },
                        { value: "3", label: "Super admins only" },
                      ]}
                    />
                  </Group>
                  <Group gap="md" justify="space-between" align="center">
                    <Text>Update group image</Text>
                    <NativeSelect
                      disabled={
                        group.metadata?.conversationType === "dm" ||
                        permissionsPolicy !==
                          GroupPermissionsOptions.CustomPolicy
                      }
                      value={policySet.updateGroupImageUrlSquarePolicy}
                      onChange={(event) => {
                        setPolicySet({
                          ...policySet,
                          updateGroupImageUrlSquarePolicy: parseInt(
                            event.currentTarget.value,
                            10,
                          ) as PermissionPolicy,
                        });
                      }}
                      data={[
                        { value: "0", label: "Everyone" },
                        { value: "1", label: "Disabled" },
                        { value: "2", label: "Admins only" },
                        { value: "3", label: "Super admins only" },
                      ]}
                    />
                  </Group>
                </Stack>
              </Paper>
              <Paper p="md" radius="md" withBorder>
                <Stack gap="md">
                  <Title order={4}>Members</Title>
                  {group.metadata?.conversationType !== "dm" && (
                    <>
                      <Group gap="xs" align="flex-start">
                        <Stack flex={1} gap="xs">
                          <TextInput
                            size="md"
                            label="Address"
                            error={addressError}
                            value={address}
                            onChange={(event) => {
                              setAddress(event.target.value);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                handleAddMember();
                              }
                            }}
                          />
                        </Stack>
                        <Button
                          size="md"
                          mt="1.5rem"
                          disabled={addressError !== null}
                          onClick={handleAddMember}>
                          Add
                        </Button>
                      </Group>
                      <Stack gap="xs">
                        <Group gap="xs">
                          <Text fw={700}>Added members</Text>
                          <Badge color="gray" size="lg">
                            {addedMembers.length}
                          </Badge>
                        </Group>
                        <Stack gap="4px">
                          {addedMembers.map((member) => (
                            <Group
                              key={member}
                              justify="space-between"
                              align="center">
                              <Text truncate="end" flex={1}>
                                {member}
                              </Text>
                              <Button
                                onClick={() => {
                                  setAddedMembers(
                                    addedMembers.filter((m) => m !== member),
                                  );
                                }}>
                                Remove
                              </Button>
                            </Group>
                          ))}
                        </Stack>
                      </Stack>
                      <Stack gap="xs">
                        <Group gap="xs">
                          <Text fw={700}>Removed members</Text>
                          <Badge color="gray" size="lg">
                            {removedMembers.length}
                          </Badge>
                        </Group>
                        <Stack gap="4px">
                          {removedMembers.map((member) => (
                            <Group
                              key={member.inboxId}
                              justify="space-between"
                              align="center">
                              <Text truncate="end" flex={1}>
                                {member.accountIdentifiers
                                  .map((identifier) => identifier.identifier)
                                  .join(", ")}
                              </Text>
                              <Button
                                onClick={() => {
                                  setRemovedMembers(
                                    removedMembers.filter(
                                      (m) => m.inboxId !== member.inboxId,
                                    ),
                                  );
                                  setMembers([...members, member]);
                                }}>
                                Restore
                              </Button>
                            </Group>
                          ))}
                        </Stack>
                      </Stack>
                    </>
                  )}
                  <Stack gap="xs">
                    <Group gap="xs">
                      <Text fw={700}>Members</Text>
                      <Badge color="gray" size="lg">
                        {members.length - 1}
                      </Badge>
                    </Group>
                    <Stack gap="4px">
                      {members.map(
                        (member) =>
                          client?.inboxId !== member.inboxId && (
                            <Group
                              key={member.inboxId}
                              justify="space-between"
                              align="center"
                              wrap="nowrap">
                              <BadgeWithCopy value={member.inboxId} />
                              {group.metadata?.conversationType !== "dm" && (
                                <Button
                                  flex="0 0 auto"
                                  size="xs"
                                  onClick={() => {
                                    setMembers(
                                      members.filter(
                                        (m) => m.inboxId !== member.inboxId,
                                      ),
                                    );
                                    setRemovedMembers([
                                      ...removedMembers,
                                      member,
                                    ]);
                                  }}>
                                  Remove
                                </Button>
                              )}
                            </Group>
                          ),
                      )}
                    </Stack>
                  </Stack>
                </Stack>
              </Paper>
            </Stack>
          </ScrollArea>
          <Group gap="xs" justify="flex-end">
            <Button
              variant="default"
              onClick={() => void navigate(`/conversations/${group.id}`)}>
              Cancel
            </Button>
            <Button onClick={() => void handleUpdate()}>Update</Button>
          </Group>
        </Stack>
      </FocusTrap>
    </>
  );
};
