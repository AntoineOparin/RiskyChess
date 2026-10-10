import { useEffect, useState } from 'react';
import { getSocket } from './socket';

/** Whether the game socket is connected, live. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(getSocket().connected);
  useEffect(() => {
    const socket = getSocket();
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    socket.on('connect', up);
    socket.on('disconnect', down);
    setOnline(socket.connected);
    return () => {
      socket.off('connect', up);
      socket.off('disconnect', down);
    };
  }, []);
  return online;
}
