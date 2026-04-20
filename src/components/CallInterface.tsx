import React, { useState, useEffect, useRef } from 'react';
import Peer, { MediaConnection } from 'peerjs';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  doc, 
  getDoc, 
  updateDoc, 
  deleteDoc,
  setDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Phone, Video, PhoneOff, Mic, MicOff, VideoOff, Camera, User, Loader2, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface CallState {
  isCalling: boolean;
  isReceiving: boolean;
  isInCall: boolean;
  otherUser: any;
  type: 'audio' | 'video';
  roomId: string | null;
}

export default function CallInterface() {
  const { currentUser } = useAuth();
  const [callState, setCallState] = useState<CallState>({
    isCalling: false,
    isReceiving: false,
    isInCall: false,
    otherUser: null,
    type: 'video',
    roomId: null
  });

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  
  const peerRef = useRef<Peer | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const currentCallRef = useRef<MediaConnection | null>(null);

  // 1. Initialize Peer and Listen for Incoming Signaling (Firestore)
  useEffect(() => {
    if (!currentUser) return;

    // Use User ID as Peer ID
    const peer = new Peer(currentUser.uid);
    peerRef.current = peer;

    // Listen for incoming PeerJS calls
    peer.on('call', (call) => {
      // Incoming call logic: we first need the metadata from Firestore
      // Actually, PeerJS 'call' happens when the OTHER side calls us.
      // We need to know WHO is calling to show the UI.
    });

    // Listen for Calling signaling in Firestore
    const q = query(
      collection(db, 'calls'),
      where('recipientId', '==', currentUser.uid),
      where('status', '==', 'ringing')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (!snapshot.empty && !callState.isInCall && !callState.isReceiving && !callState.isCalling) {
        const callData = snapshot.docs[0].data();
        const senderSnap = await getDoc(doc(db, 'users', callData.senderId));
        
        setCallState({
          isCalling: false,
          isReceiving: true,
          isInCall: false,
          otherUser: senderSnap.exists() ? { uid: senderSnap.id, ...senderSnap.data() } : null,
          type: callData.type,
          roomId: snapshot.docs[0].id
        });
      } else if (snapshot.empty && callState.isReceiving) {
          // Call was cancelled or timed out
          cleanup();
      }
    });

    return () => {
      unsubscribe();
      peer.destroy();
    };
  }, [currentUser]);

  // Handle stream assignment
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Global listener for Messenger to trigger calls
  useEffect(() => {
    const handleStartCall = (e: any) => {
       const { userId, type, userName, userAvatar } = e.detail;
       startCall(userId, type, { displayName: userName, photoURL: userAvatar });
    };

    window.addEventListener('start-call', handleStartCall);
    return () => window.removeEventListener('start-call', handleStartCall);
  }, [currentUser]);

  const startCall = async (targetId: string, type: 'audio' | 'video', targetUser: any) => {
    if (!currentUser) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: type === 'video',
        audio: true
      });
      setLocalStream(stream);

      const callDoc = await addDoc(collection(db, 'calls'), {
        senderId: currentUser.uid,
        recipientId: targetId,
        type,
        status: 'ringing',
        createdAt: serverTimestamp()
      });

      setCallState({
        isCalling: true,
        isReceiving: false,
        isInCall: false,
        otherUser: targetUser,
        type,
        roomId: callDoc.id
      });

      // Listen for call acceptance
      const unsub = onSnapshot(doc(db, 'calls', callDoc.id), (doc) => {
        const data = doc.data();
        if (data?.status === 'accepted') {
          setCallState(prev => ({ ...prev, isInCall: true, isCalling: false }));
          initiatePeerCall(targetId, stream);
          unsub();
        } else if (data?.status === 'rejected' || data?.status === 'ended') {
          cleanup();
          unsub();
        }
      });

    } catch (err) {
      console.error("Failed to get media", err);
      alert("Please allow camera/microphone access to make calls.");
    }
  };

  const initiatePeerCall = (targetId: string, stream: MediaStream) => {
    if (!peerRef.current) return;
    const call = peerRef.current.call(targetId, stream);
    currentCallRef.current = call;
    call.on('stream', (remote) => {
      setRemoteStream(remote);
    });
  };

  const acceptCall = async () => {
    if (!callState.roomId || !currentUser) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: callState.type === 'video',
        audio: true
      });
      setLocalStream(stream);

      await updateDoc(doc(db, 'calls', callState.roomId), {
        status: 'accepted'
      });

      setCallState(prev => ({ ...prev, isInCall: true, isReceiving: false }));

      // Wait for PeerJS incoming call
      peerRef.current?.on('call', (call) => {
        currentCallRef.current = call;
        call.answer(stream);
        call.on('stream', (remote) => {
          setRemoteStream(remote);
        });
      });

    } catch (err) {
      console.error("Failed to accept call", err);
      cleanup();
    }
  };

  const rejectCall = async () => {
    if (callState.roomId) {
      await updateDoc(doc(db, 'calls', callState.roomId), { status: 'rejected' });
    }
    cleanup();
  };

  const endCall = async () => {
    if (callState.roomId) {
      await updateDoc(doc(db, 'calls', callState.roomId), { status: 'ended' });
    }
    cleanup();
  };

  const cleanup = () => {
    localStream?.getTracks().forEach(track => track.stop());
    setLocalStream(null);
    setRemoteStream(null);
    currentCallRef.current?.close();
    setCallState({
      isCalling: false,
      isReceiving: false,
      isInCall: false,
      otherUser: null,
      type: 'video',
      roomId: null
    });
  };

  const toggleMic = () => {
    if (localStream) {
       const audioTrack = localStream.getAudioTracks()[0];
       audioTrack.enabled = !audioTrack.enabled;
       setIsMicOn(audioTrack.enabled);
    }
  };

  const toggleCam = () => {
     if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
           videoTrack.enabled = !videoTrack.enabled;
           setIsCamOn(videoTrack.enabled);
        }
     }
  };

  if (!callState.isCalling && !callState.isReceiving && !callState.isInCall) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center text-white p-4">
      
      {/* Background/Current View */}
      <div className="relative w-full h-full max-w-lg aspect-[9/16] bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-zinc-800">
        
        {/* Remote Stream (Main View) */}
        {remoteStream ? (
           <video 
             ref={remoteVideoRef} 
             autoPlay 
             playsInline 
             className="w-full h-full object-cover"
           />
        ) : (
           <div className="w-full h-full flex flex-col items-center justify-center space-y-6">
              <div className="w-32 h-32 rounded-full overflow-hidden bg-zinc-800 border-4 border-zinc-700 animate-pulse">
                {callState.otherUser?.photoURL ? (
                  <img src={callState.otherUser.photoURL} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600">
                    <User className="w-16 h-16" />
                  </div>
                )}
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-black">{callState.otherUser?.displayName}</h2>
                <p className="text-zinc-500 font-medium tracking-widest uppercase text-xs mt-2">
                  {callState.isCalling ? 'Calling...' : callState.isReceiving ? 'Incoming Call' : 'Connecting...'}
                </p>
              </div>
           </div>
        )}

        {/* Local Stream (PIP) */}
        {localStream && callState.isInCall && (
          <div className="absolute top-4 right-4 w-32 aspect-[9/16] bg-black rounded-xl overflow-hidden border-2 border-white/20 shadow-lg">
             <video 
               ref={localVideoRef} 
               autoPlay 
               muted 
               playsInline 
               className="w-full h-full object-cover mirror"
             />
          </div>
        )}

        {/* Call Controls Overlay */}
        <div className="absolute inset-x-0 bottom-0 p-8 flex flex-col items-center space-y-10 bg-gradient-to-t from-black/80 to-transparent">
          
          <div className="flex items-center space-x-6">
             {callState.isReceiving ? (
                <>
                  <button 
                    onClick={rejectCall}
                    className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center shadow-red-500/40 shadow-lg hover:scale-110 active:scale-95 transition"
                  >
                    <PhoneOff className="w-8 h-8 rotate-[135deg]" />
                  </button>
                  <button 
                    onClick={acceptCall}
                    className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center shadow-green-500/40 shadow-lg animate-bounce hover:scale-110 active:scale-95 transition"
                  >
                    {callState.type === 'video' ? <Video className="w-8 h-8" /> : <Phone className="w-8 h-8" />}
                  </button>
                </>
             ) : (
               <>
                  <button 
                    onClick={toggleMic}
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center transition backdrop-blur-md",
                      isMicOn ? "bg-white/10 hover:bg-white/20" : "bg-red-500"
                    )}
                  >
                    {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                  </button>

                  <button 
                    onClick={endCall}
                    className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center shadow-red-600/40 shadow-lg hover:bg-red-700 hover:scale-105 active:scale-95 transition"
                  >
                    <PhoneOff className="w-8 h-8" />
                  </button>

                  {callState.type === 'video' && (
                    <button 
                      onClick={toggleCam}
                      className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center transition backdrop-blur-md",
                        isCamOn ? "bg-white/10 hover:bg-white/20" : "bg-red-500"
                      )}
                    >
                      {isCamOn ? <Camera className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                    </button>
                  )}
               </>
             )}
          </div>

          {!callState.isReceiving && !callState.isInCall && (
            <div className="flex items-center space-x-2 text-zinc-500">
               <Loader2 className="w-4 h-4 animate-spin" />
               <span className="text-sm font-medium">Connecting...</span>
            </div>
          )}
        </div>
      </div>
      
      <style>{`
        .mirror {
          transform: scaleX(-1);
        }
      `}</style>
    </div>
  );
}
