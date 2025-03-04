class StreamHandler {
  constructor(room) {
    this.room = room;
    this.localStream = null;
    this.peerConnections = {};
    this.viewers = new Set();
    this.isStreaming = false;
    this.streamId = null;
  }

  // Initialize screen capture and start streaming
  async startStream(title) {
    try {
      // Get display media (screen capture)
      const displayMediaOptions = {
        video: {
          cursor: "always",
          displaySurface: "window" // could be "monitor", "window", "application" or "browser"
        },
        audio: true
      };
      
      this.localStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
      
      // Create stream record in database
      const stream = await this.room.collection('liveStream').create({
        title,
        viewerCount: 0
      });
      
      this.streamId = stream.id;
      this.isStreaming = true;
      
      // Create a dedicated WebSocket room for this stream
      this.streamRoom = new WebsimSocket(`stream-${this.streamId}`);
      
      // Handle incoming viewers and chat
      this.setupEventHandlers();
      
      // When the local stream ends (user stops sharing)
      this.localStream.getVideoTracks()[0].onended = () => {
        this.stopStream();
      };
      
      // Broadcast that we're going live to the main room
      this.room.send({
        type: 'streamStarted',
        streamId: this.streamId,
        title: title
      });
      
      return stream;
    } catch (err) {
      console.error("Error starting stream:", err);
      throw err;
    }
  }

  // Handle WebRTC connections and messaging
  setupEventHandlers() {
    this.streamRoom.onmessage = async (event) => {
      const data = event.data;
      
      switch(data.type) {
        case 'viewerJoined':
          // Add new viewer and create peer connection
          this.viewers.add(data.clientId);
          await this.createPeerConnection(data.clientId);
          
          // Update viewer count
          await this.updateViewerCount();
          break;
          
        case 'viewerLeft':
          // Remove viewer and clean up
          this.viewers.delete(data.clientId);
          if (this.peerConnections[data.clientId]) {
            this.peerConnections[data.clientId].close();
            delete this.peerConnections[data.clientId];
          }
          
          // Update viewer count
          await this.updateViewerCount();
          break;
          
        case 'rtcAnswer':
          // Handle answer from viewer
          if (this.peerConnections[data.clientId]) {
            try {
              await this.peerConnections[data.clientId].setRemoteDescription(
                new RTCSessionDescription(data.answer)
              );
            } catch (e) {
              console.error("Error setting remote description:", e);
            }
          }
          break;
          
        case 'iceCandidate':
          // Add ICE candidate from viewer
          if (this.peerConnections[data.clientId]) {
            try {
              await this.peerConnections[data.clientId].addIceCandidate(
                new RTCIceCandidate(data.candidate)
              );
            } catch (e) {
              console.error("Error adding ICE candidate:", e);
            }
          }
          break;
      }
    };
  }

  // Create WebRTC peer connection for a new viewer
  async createPeerConnection(viewerId) {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      
      // Add all tracks from local stream to the peer connection
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
      
      // ICE candidate handling
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.streamRoom.send({
            type: 'iceCandidate',
            clientId: viewerId,
            candidate: event.candidate
          });
        }
      };
      
      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      this.streamRoom.send({
        type: 'rtcOffer',
        clientId: viewerId,
        offer: pc.localDescription
      });
      
      this.peerConnections[viewerId] = pc;
    } catch (err) {
      console.error("Error creating peer connection:", err);
    }
  }

  // Update the viewer count in the database
  async updateViewerCount() {
    try {
      await this.room.collection('liveStream').update(this.streamId, {
        viewerCount: this.viewers.size
      });
    } catch (err) {
      console.error("Error updating viewer count:", err);
    }
  }

  // Stop streaming and clean up
  async stopStream() {
    if (!this.isStreaming) return;
    
    // Stop all tracks in the local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    // Close all peer connections
    Object.values(this.peerConnections).forEach(pc => pc.close());
    this.peerConnections = {};
    
    // Notify viewers that the stream has ended
    this.streamRoom.send({
      type: 'streamEnded'
    });
    
    // Close the stream room
    this.streamRoom.close();
    
    // Remove the stream from the database
    try {
      await this.room.collection('liveStream').delete(this.streamId);
    } catch (err) {
      console.error("Error deleting stream:", err);
    }
    
    // Notify the main room that the stream has ended
    this.room.send({
      type: 'streamEnded',
      streamId: this.streamId
    });
    
    this.isStreaming = false;
    this.streamId = null;
    this.viewers.clear();
  }
}

class ViewerHandler {
  constructor(room, streamId) {
    this.room = room;
    this.streamId = streamId;
    this.peerConnection = null;
    this.remoteStream = null;
    this.streamRoom = new WebsimSocket(`stream-${streamId}`);
  }

  // Connect to a stream and set up WebRTC
  async joinStream(videoElement) {
    try {
      // Notify the streamer that we joined
      this.streamRoom.send({
        type: 'viewerJoined'
      });
      
      // Set up WebRTC events
      this.setupEventHandlers(videoElement);
      
      // Set up disconnect handler
      window.addEventListener('beforeunload', this.leaveStream.bind(this));
      
      return true;
    } catch (err) {
      console.error("Error joining stream:", err);
      return false;
    }
  }

  // Set up WebRTC and message handling
  setupEventHandlers(videoElement) {
    this.streamRoom.onmessage = async (event) => {
      const data = event.data;
      
      switch(data.type) {
        case 'rtcOffer':
          // Create peer connection when we receive an offer
          await this.createPeerConnection(data.offer, videoElement);
          break;
          
        case 'iceCandidate':
          // Add ICE candidate from streamer
          if (this.peerConnection) {
            try {
              await this.peerConnection.addIceCandidate(
                new RTCIceCandidate(data.candidate)
              );
            } catch (e) {
              console.error("Error adding ICE candidate:", e);
            }
          }
          break;
          
        case 'streamEnded':
          // Handle stream ending
          this.handleStreamEnded();
          break;
      }
    };
  }

  // Create a WebRTC peer connection as a viewer
  async createPeerConnection(offer, videoElement) {
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    
    // Set up remote stream handling
    this.peerConnection.ontrack = (event) => {
      if (videoElement) {
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
          videoElement.srcObject = this.remoteStream;
        }
        
        event.streams[0].getTracks().forEach(track => {
          this.remoteStream.addTrack(track);
        });
      }
    };
    
    // ICE candidate handling
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.streamRoom.send({
          type: 'iceCandidate',
          candidate: event.candidate
        });
      }
    };
    
    // Set remote description (the offer from the streamer)
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    
    // Create and send answer
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    
    this.streamRoom.send({
      type: 'rtcAnswer',
      answer: this.peerConnection.localDescription
    });
  }

  // Handle stream ending
  handleStreamEnded() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStream = null;
    }
    
    // Show stream ended UI or redirect
    alert("The stream has ended");
    // You might want to redirect to the home page or show a different UI
  }

  // Leave the stream and clean up
  leaveStream() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStream = null;
    }
    
    // Notify the streamer that we left
    this.streamRoom.send({
      type: 'viewerLeft'
    });
    
    // Close the stream room connection
    this.streamRoom.close();
    
    // Remove event listeners
    window.removeEventListener('beforeunload', this.leaveStream.bind(this));
  }

  // Send a chat message to the stream
  sendMessage(message) {
    this.streamRoom.send({
      type: 'chat',
      message: message
    });
  }
}

