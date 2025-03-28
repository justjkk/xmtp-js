import { join } from "node:path";
import process from "node:process";
import {
  ContentTypeGroupUpdated,
  GroupUpdatedCodec,
} from "@xmtp/content-type-group-updated";
import type {
  ContentCodec,
  ContentTypeId,
  EncodedContent,
} from "@xmtp/content-type-primitives";
import { TextCodec } from "@xmtp/content-type-text";
import {
  createClient,
  generateInboxId,
  getInboxIdForIdentifier,
  GroupMessageKind,
  IdentifierKind,
  isAddressAuthorized as isAddressAuthorizedBinding,
  isInstallationAuthorized as isInstallationAuthorizedBinding,
  LogLevel,
  SignatureRequestType,
  verifySignedWithPublicKey as verifySignedWithPublicKeyBinding,
  type Identifier,
  type LogOptions,
  type Message,
  type Client as NodeClient,
} from "@xmtp/node-bindings";
import { Conversations } from "@/Conversations";
import { type Signer } from "@/helpers/signer";
import { version } from "@/helpers/version";
import { Preferences } from "@/Preferences";

export const ApiUrls = {
  local: "http://localhost:5556",
  dev: "https://grpc.dev.xmtp.network:443",
  production: "https://grpc.production.xmtp.network:443",
} as const;

export const HistorySyncUrls = {
  local: "http://localhost:5558",
  dev: "https://message-history.dev.ephemera.network",
  production: "https://message-history.production.ephemera.network",
} as const;

export type XmtpEnv = keyof typeof ApiUrls;

/**
 * Network options
 */
export type NetworkOptions = {
  /**
   * Specify which XMTP environment to connect to. (default: `dev`)
   */
  env?: XmtpEnv;
  /**
   * apiUrl can be used to override the `env` flag and connect to a
   * specific endpoint
   */
  apiUrl?: string;
  /**
   * historySyncUrl can be used to override the `env` flag and connect to a
   * specific endpoint for syncing history
   */
  historySyncUrl?: string;
};

/**
 * Storage options
 */
export type StorageOptions = {
  /**
   * Path to the local DB
   */
  dbPath?: string;
};

export type ContentOptions = {
  /**
   * Allow configuring codecs for additional content types
   */
  codecs?: ContentCodec[];
};

export type OtherOptions = {
  /**
   * Enable structured JSON logging
   */
  structuredLogging?: boolean;
  /**
   * Logging level
   */
  loggingLevel?: LogLevel;
  /**
   * Disable automatic registration when creating a client
   */
  disableAutoRegister?: boolean;
};

export type ClientOptions = NetworkOptions &
  StorageOptions &
  ContentOptions &
  OtherOptions;

export class Client {
  #innerClient: NodeClient;
  #conversations: Conversations;
  #preferences: Preferences;
  #signer: Signer;
  #codecs: Map<string, ContentCodec>;

  constructor(client: NodeClient, signer: Signer, codecs: ContentCodec[]) {
    this.#innerClient = client;
    const conversations = client.conversations();
    this.#conversations = new Conversations(this, conversations);
    this.#preferences = new Preferences(client, conversations);
    this.#signer = signer;
    this.#codecs = new Map(
      codecs.map((codec) => [codec.contentType.toString(), codec]),
    );
  }

  static async create(
    signer: Signer,
    encryptionKey: Uint8Array,
    options?: ClientOptions,
  ) {
    const host = options?.apiUrl || ApiUrls[options?.env || "dev"];
    const isSecure = host.startsWith("https");
    const identifier = await signer.getIdentifier();
    const inboxId =
      (await getInboxIdForIdentifier(host, isSecure, identifier)) ||
      generateInboxId(identifier);
    const dbPath =
      options?.dbPath ||
      join(process.cwd(), `xmtp-${options?.env || "dev"}-${inboxId}.db3`);
    const logOptions: LogOptions = {
      structured: options?.structuredLogging ?? false,
      level: options?.loggingLevel ?? LogLevel.off,
    };
    const historySyncUrl =
      options?.historySyncUrl || HistorySyncUrls[options?.env || "dev"];

    const client = new Client(
      await createClient(
        host,
        isSecure,
        dbPath,
        inboxId,
        identifier,
        encryptionKey,
        historySyncUrl,
        logOptions,
      ),
      signer,
      [new GroupUpdatedCodec(), new TextCodec(), ...(options?.codecs ?? [])],
    );

    if (!options?.disableAutoRegister) {
      await client.register();
    }

    return client;
  }

  get identifier() {
    return this.#innerClient.accountIdentifier;
  }

  get inboxId() {
    return this.#innerClient.inboxId();
  }

  get installationId() {
    return this.#innerClient.installationId();
  }

  get installationIdBytes() {
    return this.#innerClient.installationIdBytes();
  }

  get isRegistered() {
    return this.#innerClient.isRegistered();
  }

  get conversations() {
    return this.#conversations;
  }

  get preferences() {
    return this.#preferences;
  }

  /**
   * WARNING: This function should be used with caution. It is only provided
   * for use in special cases where the provided workflows do not meet the
   * requirements of an application.
   *
   * It is highly recommended to use the `register` function instead.
   */
  async unsafe_createInboxSignatureText() {
    try {
      const signatureText = await this.#innerClient.createInboxSignatureText();
      return signatureText;
    } catch {
      return undefined;
    }
  }

  /**
   * WARNING: This function should be used with caution. It is only provided
   * for use in special cases where the provided workflows do not meet the
   * requirements of an application.
   *
   * It is highly recommended to use the `unsafe_addAccount` function instead.
   *
   * The `allowInboxReassign` parameter must be true or this function will
   * throw an error.
   */
  async unsafe_addAccountSignatureText(
    newAccountIdentifier: Identifier,
    allowInboxReassign: boolean = false,
  ) {
    if (!allowInboxReassign) {
      throw new Error(
        "Unable to create add identifier signature text, `allowInboxReassign` must be true",
      );
    }

    try {
      const signatureText =
        await this.#innerClient.addIdentifierSignatureText(
          newAccountIdentifier,
        );
      return signatureText;
    } catch {
      return undefined;
    }
  }

  /**
   * WARNING: This function should be used with caution. It is only provided
   * for use in special cases where the provided workflows do not meet the
   * requirements of an application.
   *
   * It is highly recommended to use the `removeAccount` function instead.
   */
  async unsafe_removeAccountSignatureText(identifier: Identifier) {
    try {
      const signatureText =
        await this.#innerClient.revokeIdentifierSignatureText(identifier);
      return signatureText;
    } catch {
      return undefined;
    }
  }

  /**
   * WARNING: This function should be used with caution. It is only provided
   * for use in special cases where the provided workflows do not meet the
   * requirements of an application.
   *
   * It is highly recommended to use the `revokeAllOtherInstallations` function
   * instead.
   */
  async unsafe_revokeAllOtherInstallationsSignatureText() {
    try {
      const signatureText =
        await this.#innerClient.revokeAllOtherInstallationsSignatureText();
      return signatureText;
    } catch {
      return undefined;
    }
  }

  /**
   * WARNING: This function should be used with caution. It is only provided
   * for use in special cases where the provided workflows do not meet the
   * requirements of an application.
   *
   * It is highly recommended to use the `revokeInstallations` function instead.
   */
  async unsafe_revokeInstallationsSignatureText(installationIds: Uint8Array[]) {
    try {
      const signatureText =
        await this.#innerClient.revokeInstallationsSignatureText(
          installationIds,
        );
      return signatureText;
    } catch {
      return undefined;
    }
  }

  /**
   * WARNING: This function should be used with caution. It is only provided
   * for use in special cases where the provided workflows do not meet the
   * requirements of an application.
   *
   * It is highly recommended to use the `register`, `addAccount`,
   * `removeAccount`, `revokeAllOtherInstallations`, or `revokeInstallations`
   * functions instead.
   */
  async unsafe_addSignature(
    signatureType: SignatureRequestType,
    signatureText: string,
    signer: Signer,
  ) {
    switch (signer.type) {
      case "SCW":
        await this.#innerClient.addScwSignature(
          signatureType,
          await signer.signMessage(signatureText),
          signer.getChainId(),
          signer.getBlockNumber?.(),
        );
        break;
      case "EOA":
        await this.#innerClient.addEcdsaSignature(
          signatureType,
          await signer.signMessage(signatureText),
        );
        break;
    }
  }

  /**
   * WARNING: This function should be used with caution. It is only provided
   * for use in special cases where the provided workflows do not meet the
   * requirements of an application.
   *
   * It is highly recommended to use the `register`, `addAccount`,
   * `removeAccount`, `revokeAllOtherInstallations`, or `revokeInstallations`
   * functions instead.
   */
  async unsafe_applySignatures() {
    return this.#innerClient.applySignatureRequests();
  }

  async register() {
    const signatureText = await this.unsafe_createInboxSignatureText();

    // if the signature text is not available, the client is already registered
    if (!signatureText) {
      return;
    }

    await this.unsafe_addSignature(
      SignatureRequestType.CreateInbox,
      signatureText,
      this.#signer,
    );

    return this.#innerClient.registerIdentity();
  }

  /**
   * WARNING: This function should be used with caution. Adding a wallet already
   * associated with an inboxId will cause the wallet to lose access to
   * that inbox.
   *
   * The `allowInboxReassign` parameter must be true to reassign an inbox
   * already associated with a different account.
   */
  async unsafe_addAccount(
    newAccountSigner: Signer,
    allowInboxReassign: boolean = false,
  ) {
    // check for existing inbox id
    const identifier = await newAccountSigner.getIdentifier();
    const existingInboxId = await this.getInboxIdByIdentifier(identifier);

    if (existingInboxId && !allowInboxReassign) {
      throw new Error(
        `Signer address already associated with inbox ${existingInboxId}`,
      );
    }

    const signatureText = await this.unsafe_addAccountSignatureText(
      identifier,
      true,
    );

    if (!signatureText) {
      throw new Error("Unable to generate add account signature text");
    }

    await this.unsafe_addSignature(
      SignatureRequestType.AddWallet,
      signatureText,
      newAccountSigner,
    );

    await this.unsafe_applySignatures();
  }

  async removeAccount(identifier: Identifier) {
    const signatureText =
      await this.unsafe_removeAccountSignatureText(identifier);

    if (!signatureText) {
      throw new Error("Unable to generate remove account signature text");
    }

    await this.unsafe_addSignature(
      SignatureRequestType.RevokeWallet,
      signatureText,
      this.#signer,
    );

    await this.unsafe_applySignatures();
  }

  async revokeAllOtherInstallations() {
    const signatureText =
      await this.unsafe_revokeAllOtherInstallationsSignatureText();

    if (!signatureText) {
      throw new Error(
        "Unable to generate revoke all other installations signature text",
      );
    }

    await this.unsafe_addSignature(
      SignatureRequestType.RevokeInstallations,
      signatureText,
      this.#signer,
    );

    await this.unsafe_applySignatures();
  }

  async revokeInstallations(installationIds: Uint8Array[]) {
    const signatureText =
      await this.unsafe_revokeInstallationsSignatureText(installationIds);

    if (!signatureText) {
      throw new Error("Unable to generate revoke installations signature text");
    }

    await this.unsafe_addSignature(
      SignatureRequestType.RevokeInstallations,
      signatureText,
      this.#signer,
    );

    await this.unsafe_applySignatures();
  }

  async canMessage(identifiers: Identifier[]) {
    const canMessage = await this.#innerClient.canMessage(identifiers);
    return new Map(Object.entries(canMessage));
  }

  static async canMessage(identifiers: Identifier[], env?: XmtpEnv) {
    const accountAddress = "0x0000000000000000000000000000000000000000";
    const host = ApiUrls[env || "dev"];
    const isSecure = host.startsWith("https");
    const identifier: Identifier = {
      identifierKind: IdentifierKind.Ethereum,
      identifier: accountAddress,
    };
    const inboxId =
      (await getInboxIdForIdentifier(host, isSecure, identifier)) ||
      generateInboxId(identifier);
    const signer: Signer = {
      type: "EOA",
      getIdentifier: () => identifier,
      signMessage: () => new Uint8Array(),
    };
    const client = new Client(
      await createClient(host, isSecure, undefined, inboxId, identifier),
      signer,
      [],
    );
    return client.canMessage(identifiers);
  }

  codecFor(contentType: ContentTypeId) {
    return this.#codecs.get(contentType.toString());
  }

  encodeContent(content: any, contentType: ContentTypeId) {
    const codec = this.codecFor(contentType);
    if (!codec) {
      throw new Error(`no codec for ${contentType.toString()}`);
    }
    const encoded = codec.encode(content, this);
    const fallback = codec.fallback(content);
    if (fallback) {
      encoded.fallback = fallback;
    }
    return encoded;
  }

  decodeContent(message: Message, contentType: ContentTypeId) {
    const codec = this.codecFor(contentType);
    if (!codec) {
      throw new Error(`no codec for ${contentType.toString()}`);
    }

    // throw an error if there's an invalid group membership change message
    if (
      contentType.sameAs(ContentTypeGroupUpdated) &&
      message.kind !== GroupMessageKind.MembershipChange
    ) {
      throw new Error("Error decoding group membership change");
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return codec.decode(message.content as EncodedContent, this);
  }

  async requestHistorySync() {
    return this.#innerClient.sendHistorySyncRequest();
  }

  async getInboxIdByIdentifier(identifier: Identifier) {
    return this.#innerClient.findInboxIdByIdentifier(identifier);
  }

  signWithInstallationKey(signatureText: string) {
    return this.#innerClient.signWithInstallationKey(signatureText);
  }

  verifySignedWithInstallationKey(
    signatureText: string,
    signatureBytes: Uint8Array,
  ) {
    try {
      this.#innerClient.verifySignedWithInstallationKey(
        signatureText,
        signatureBytes,
      );
      return true;
    } catch {
      return false;
    }
  }

  static verifySignedWithPublicKey(
    signatureText: string,
    signatureBytes: Uint8Array,
    publicKey: Uint8Array,
  ) {
    try {
      verifySignedWithPublicKeyBinding(
        signatureText,
        signatureBytes,
        publicKey,
      );
      return true;
    } catch {
      return false;
    }
  }

  static async isAddressAuthorized(
    inboxId: string,
    address: string,
    options?: NetworkOptions,
  ): Promise<boolean> {
    const host = options?.apiUrl || ApiUrls[options?.env || "dev"];
    return await isAddressAuthorizedBinding(host, inboxId, address);
  }

  static async isInstallationAuthorized(
    inboxId: string,
    installation: Uint8Array,
    options?: NetworkOptions,
  ): Promise<boolean> {
    const host = options?.apiUrl || ApiUrls[options?.env || "dev"];
    return await isInstallationAuthorizedBinding(host, inboxId, installation);
  }

  static get version() {
    return version;
  }
}
