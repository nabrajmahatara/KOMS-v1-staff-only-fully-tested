/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!token || !user) {
      return undefined;
    }

    const nextSocket = io(import.meta.env.VITE_SOCKET_URL, {
      auth: { token },
    });

    const handleConnect = () => setSocket(nextSocket);
    const handleDisconnect = () => setSocket(null);

    nextSocket.on("connect", handleConnect);
    nextSocket.on("disconnect", handleDisconnect);

    return () => {
      nextSocket.off("connect", handleConnect);
      nextSocket.off("disconnect", handleDisconnect);
      nextSocket.disconnect();
      setSocket(null);
    };
  }, [token, user]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
