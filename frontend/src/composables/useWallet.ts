import { ref, onMounted } from 'vue';
import { PublicKey } from '@solana/web3.js';

export function useWallet() {
  const publicKey = ref<PublicKey | null>(null);
  const connected = ref(false);

  const checkConnection = async () => {
    try {
      const { solana } = window as any;
      if (solana && solana.isPhantom) {
        const res = await solana.connect({ onlyIfTrusted: true });
        publicKey.value = new PublicKey(res.publicKey.toString());
        connected.value = true;
      }
    } catch (err) {
      // Not previously connected
    }
  };

  const connect = async () => {
    const { solana } = window as any;
    if (solana && solana.isPhantom) {
      try {
        const res = await solana.connect();
        publicKey.value = new PublicKey(res.publicKey.toString());
        connected.value = true;
      } catch (err) {
        console.error("User rejected request.");
      }
    } else {
      alert("Phantom wallet not found! Please install it.");
      window.open("https://phantom.app/", "_blank");
    }
  };

  const disconnect = async () => {
    const { solana } = window as any;
    if (solana) {
      await solana.disconnect();
      publicKey.value = null;
      connected.value = false;
    }
  };

  onMounted(() => {
    checkConnection();
  });

  return { publicKey, connected, connect, disconnect };
}
