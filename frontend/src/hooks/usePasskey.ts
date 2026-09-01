import { useState } from 'react';
import { useWalletStore } from '../store/useWalletStore';
import { registerBiometricPasskey, signWithBiometrics } from '../lib/veridex';

export function usePasskey() {
  const [isSigning, setIsSigning] = useState(false);
  const setPasskeyRegistered = useWalletStore((state) => state.setPasskeyRegistered);

  const registerPasskey = async (username: string = 'user_' + Date.now().toString(36)) => {
    setIsSigning(true);
    try {
      const attestation = await registerBiometricPasskey(username);
      setPasskeyRegistered(true);
      return attestation;
    } catch (err) {
      console.error('Passkey registration failed:', err);
      return null;
    } finally {
      setIsSigning(false);
    }
  };

  const signUserOperation = async (userOpHash: string) => {
    setIsSigning(true);
    try {
      const challenge = new TextEncoder().encode(userOpHash);
      const signature = await signWithBiometrics(challenge);
      return signature;
    } catch (err) {
      console.error('Passkey signing failed:', err);
      throw err;
    } finally {
      setIsSigning(false);
    }
  };

  return {
    registerPasskey,
    signUserOperation,
    isSigning,
  };
}
