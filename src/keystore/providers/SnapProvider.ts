import { KeystoreProviderUnavailableError } from './errors'
import { Keystore } from '../interfaces'
import { KeystoreProvider, KeystoreProviderOptions } from './interfaces'
import { SnapKeystore } from '../SnapKeystore'
import {
  connectSnap,
  getSnap,
  getWalletStatus,
  hasMetamaskWithSnaps,
  initSnap,
} from '../snapHelpers'
import { keystore } from '@xmtp/proto'
import { Signer } from '../../types/Signer'
import { ApiClient } from '../../ApiClient'
import NetworkKeystoreProvider from './NetworkKeystoreProvider'
import { PrivateKeyBundleV1 } from '../../crypto'
import KeyGeneratorKeystoreProvider from './KeyGeneratorKeystoreProvider'
import type { XmtpEnv } from '../../Client'
const { GetKeystoreStatusResponse_KeystoreStatus: KeystoreStatus } = keystore

export const SNAP_LOCAL_ORIGIN = 'local:http://localhost:8080'

/**
 * The Snap keystore provider will:
 * 1. Check if the user is capable of using Snaps
 * 2. Check if the user has already setup the Snap with the appropriate keys
 * 3. If not, will get keys from the network or create new keys and store them in the Snap
 */
export default class SnapKeystoreProvider implements KeystoreProvider {
  snapId: string
  snapVersion?: string

  constructor(snapId = SNAP_LOCAL_ORIGIN, snapVersion?: string) {
    this.snapId = snapId
    this.snapVersion = snapVersion
  }

  async newKeystore(
    opts: KeystoreProviderOptions,
    apiClient: ApiClient,
    wallet?: Signer
  ): Promise<Keystore> {
    if (!wallet) {
      throw new KeystoreProviderUnavailableError('No wallet provided')
    }

    if (!(await hasMetamaskWithSnaps())) {
      throw new KeystoreProviderUnavailableError(
        'MetaMask with Snaps not detected'
      )
    }

    const walletAddress = await wallet.getAddress()
    const env = opts.env
    const hasSnap = await getSnap(this.snapId, this.snapVersion)
    if (!hasSnap) {
      await connectSnap(
        this.snapId,
        this.snapVersion ? { version: this.snapVersion } : {}
      )
    }

    if (!(await checkSnapLoaded(walletAddress, env, this.snapId))) {
      const bundle = await getBundle(opts, apiClient, wallet)
      await initSnap(bundle, env, this.snapId)
    }

    return SnapKeystore(walletAddress, env, this.snapId)
  }
}

async function createBundle(
  opts: KeystoreProviderOptions,
  apiClient: ApiClient,
  wallet: Signer
) {
  const tmpProvider = new KeyGeneratorKeystoreProvider()
  const tmpKeystore = await tmpProvider.newKeystore(opts, apiClient, wallet)
  return new PrivateKeyBundleV1(await tmpKeystore.getPrivateKeyBundle())
}

async function getBundle(
  opts: KeystoreProviderOptions,
  apiClient: ApiClient,
  wallet: Signer
): Promise<PrivateKeyBundleV1> {
  // I really don't love using other providers inside a provider. Feels like too much indirection
  // TODO: Refactor keystore providers to better support the weird Snap flow
  const networkProvider = new NetworkKeystoreProvider()
  try {
    const tmpKeystore = await networkProvider.newKeystore(
      opts,
      apiClient,
      wallet
    )
    return new PrivateKeyBundleV1(await tmpKeystore.getPrivateKeyBundle())
  } catch (e) {
    if (e instanceof KeystoreProviderUnavailableError) {
      return createBundle(opts, apiClient, wallet)
    }
    throw e
  }
}

async function checkSnapLoaded(
  walletAddress: string,
  env: XmtpEnv,
  snapId: string
) {
  const status = await getWalletStatus({ walletAddress, env }, snapId)
  if (status === KeystoreStatus.KEYSTORE_STATUS_INITIALIZED) {
    return true
  }
  return false
}
