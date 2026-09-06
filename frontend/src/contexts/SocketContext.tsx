import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  onlineUsers: number[];
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<number[]>([]);
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || !user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const token = localStorage.getItem('accessToken');
    // Falling back to a literal 'localhost' breaks the socket for anyone who isn't
    // on the dev machine itself (e.g. a phone on the LAN, where 'localhost' means
    // the phone) -- derive the backend host from whatever host the browser actually
    // used to load the page instead.
    const socketUrl =
      import.meta.env.VITE_API_URL?.replace('/api/v1', '') ||
      `${window.location.protocol}//${window.location.hostname}:3001`;
    
    const newSocket = io(socketUrl, {
      auth: { token },
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      timeout: 5000,
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      setIsConnected(true);
      newSocket.emit('presence:join', { userId: user.id });
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.warn('Socket connection error:', error.message);
      // Don't block the app, just log the error
    });

    newSocket.on('presence:online-users', (users: number[]) => {
      setOnlineUsers(users);
    });

    newSocket.on('presence:user-joined', (userId: number) => {
      setOnlineUsers(prev => [...new Set([...prev, userId])]);
    });

    newSocket.on('presence:user-left', (userId: number) => {
      setOnlineUsers(prev => prev.filter(id => id !== userId));
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- socket is set by this effect itself; including it would create a reconnect loop
  }, [isAuthenticated, user]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, onlineUsers }}>
      {children}
    </SocketContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- context hook co-located with its Provider
export function useSocket() {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}

// Hook for chat functionality
// eslint-disable-next-line react-refresh/only-export-components -- context hook co-located with its Provider
export function useChat(conversationId?: number) {
  const { socket } = useSocket();
  const [messages, setMessages] = useState<any[]>([]);
  const [typing, setTyping] = useState<number[]>([]);

  useEffect(() => {
    if (!socket || !conversationId) return;

    socket.emit('chat:join', conversationId);

    socket.on('chat:message', (message: any) => {
      if (message.conversationId === conversationId) {
        setMessages(prev => [...prev, message]);
      }
    });

    socket.on('chat:typing', ({ conversationId: cId, userId }: { conversationId: number; userId: number }) => {
      if (cId === conversationId) {
        setTyping(prev => [...new Set([...prev, userId])]);
        setTimeout(() => {
          setTyping(prev => prev.filter(id => id !== userId));
        }, 3000);
      }
    });

    return () => {
      socket.emit('chat:leave', conversationId);
      socket.off('chat:message');
      socket.off('chat:typing');
    };
  }, [socket, conversationId]);

  const sendMessage = (body: string) => {
    if (!socket || !conversationId) return;
    socket.emit('chat:send', { conversationId, body });
  };

  const sendTyping = () => {
    if (!socket || !conversationId) return;
    socket.emit('chat:typing', conversationId);
  };

  return { messages, setMessages, typing, sendMessage, sendTyping };
}

// Hook for live sessions
// eslint-disable-next-line react-refresh/only-export-components -- context hook co-located with its Provider
export function useLiveSession(sessionId?: number) {
  const { socket } = useSocket();
  const [participants, setParticipants] = useState<any[]>([]);

  useEffect(() => {
    if (!socket || !sessionId) return;

    socket.emit('live:join', sessionId);

    socket.on('live:participant-joined', (participant: any) => {
      setParticipants(prev => [...prev, participant]);
    });

    socket.on('live:participant-left', (userId: number) => {
      setParticipants(prev => prev.filter(p => p.userId !== userId));
    });

    return () => {
      socket.emit('live:leave', sessionId);
      socket.off('live:participant-joined');
      socket.off('live:participant-left');
    };
  }, [socket, sessionId]);

  const sendSignal = (type: string, payload: any) => {
    if (!socket || !sessionId) return;
    socket.emit('live:signal', { sessionId, type, payload });
  };

  return { participants, sendSignal };
}
