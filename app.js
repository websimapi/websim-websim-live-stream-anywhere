import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

// Main App Component
function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [currentStream, setCurrentStream] = useState(null);
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const room = useRef(new WebsimSocket());
  
  // Get current username
  const [username, setUsername] = useState('');
  
  useEffect(() => {
    setUsername(room.current.party.client.username);
  }, []);

  // Handle page navigation
  const navigateTo = (page, stream = null) => {
    setCurrentPage(page);
    if (stream) {
      setCurrentStream(stream);
    }
  };

  // Render the appropriate page based on currentPage state
  const renderPage = () => {
    switch (currentPage) {
      case 'stream':
        return <StreamView stream={currentStream} room={room.current} navigateTo={navigateTo} />;
      case 'home':
      default:
        return <HomePage navigateTo={navigateTo} room={room.current} isLive={isLive} />;
    }
  };

  return (
    <div className="app-container">
      <Header 
        navigateTo={navigateTo} 
        currentPage={currentPage} 
        showLiveModal={() => setShowLiveModal(true)} 
        isLive={isLive}
        username={username}
      />
      <main className="main-content">
        {renderPage()}
      </main>
      
      {showLiveModal && (
        <GoLiveModal 
          onClose={() => setShowLiveModal(false)} 
          onStartStream={() => {
            setIsLive(true);
            setShowLiveModal(false);
          }}
          room={room.current}
        />
      )}
    </div>
  );
}

// Header Component
function Header({ navigateTo, currentPage, showLiveModal, isLive, username }) {
  return (
    <header className="header">
      <div className="logo" onClick={() => navigateTo('home')}>
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/>
        </svg>
        <span>Websim Live</span>
      </div>
      
      <nav className="nav">
        <a 
          href="#" 
          className={`nav-link ${currentPage === 'home' ? 'active' : ''}`}
          onClick={(e) => {
            e.preventDefault();
            navigateTo('home');
          }}
        >
          Browse
        </a>
        <a href="#" className="nav-link">Following</a>
      </nav>
      
      <div className="user-menu">
        {!isLive ? (
          <button className="go-live-btn" onClick={showLiveModal}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="8" />
            </svg>
            Go Live
          </button>
        ) : (
          <button className="go-live-btn" style={{ backgroundColor: 'var(--primary)' }}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            Live Now
          </button>
        )}
        
        <img 
          className="avatar" 
          src={`https://images.websim.ai/avatar/${username}`} 
          alt="User avatar" 
        />
      </div>
    </header>
  );
}

// Home Page Component (Browse Streams)
function HomePage({ navigateTo, room, isLive }) {
  const [liveStreams, setLiveStreams] = useState([]);
  
  useEffect(() => {
    // Subscribe to live streams collection
    const unsubscribe = room.collection('liveStream').subscribe((streams) => {
      setLiveStreams(streams);
    });
    
    return () => unsubscribe();
  }, [room]);

  return (
    <div>
      <h2>Live Channels</h2>
      
      {liveStreams.length === 0 && (
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <p>No one is streaming right now.</p>
          {!isLive && (
            <p>Be the first to go live!</p>
          )}
        </div>
      )}
      
      <div className="streams-container">
        {liveStreams.map(stream => (
          <StreamCard 
            key={stream.id} 
            stream={stream} 
            onClick={() => navigateTo('stream', stream)} 
          />
        ))}
      </div>
    </div>
  );
}

// Stream Card Component
function StreamCard({ stream, onClick }) {
  return (
    <div className="stream-card" onClick={onClick}>
      <div className="stream-thumbnail">
        <div className="live-badge">LIVE</div>
        <div className="viewer-count">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
          </svg>
          {stream.viewerCount || 0}
        </div>
      </div>
      <div className="stream-info">
        <h3 className="stream-title">{stream.title}</h3>
        <div className="streamer-info">
          <img 
            className="streamer-avatar" 
            src={`https://images.websim.ai/avatar/${stream.username}`} 
            alt={stream.username} 
          />
          <span>{stream.username}</span>
        </div>
      </div>
    </div>
  );
}

// Stream View Page Component
function StreamView({ stream, room, navigateTo }) {
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [viewers, setViewers] = useState([]);
  const chatMessagesRef = useRef(null);

  useEffect(() => {
    // Join the specific stream room
    const streamRoom = new WebsimSocket(`stream-${stream.id}`);
    
    // Handle chat messages
    streamRoom.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'chat') {
        setMessages(prevMessages => [...prevMessages, {
          id: Date.now(),
          author: data.username,
          text: data.message,
          timestamp: new Date().toISOString()
        }]);
      }
    };
    
    // Update viewer count
    streamRoom.party.subscribe((peers) => {
      setViewers(Object.values(peers));
    });
    
    // Get previous chat messages
    const unsubscribe = room.collection('chatMessage')
      .filter({ streamId: stream.id })
      .subscribe((chatMessages) => {
        setMessages(chatMessages.map(msg => ({
          id: msg.id,
          author: msg.username,
          text: msg.message,
          timestamp: msg.created_at
        })));
      });
    
    return () => {
      streamRoom.close();
      unsubscribe();
    };
  }, [stream.id, room]);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!messageInput.trim()) return;
    
    // Send the message via WebSocket for real-time updates
    room.send({
      type: 'chat',
      streamId: stream.id,
      message: messageInput
    });
    
    // Also save to database for persistence
    await room.collection('chatMessage').create({
      streamId: stream.id,
      message: messageInput
    });
    
    setMessageInput('');
  };

  return (
    <div className="stream-view">
      <div className="stream-player">
        <div className="video-container"></div>
        <div className="stream-info-bar">
          <div className="stream-details">
            <img 
              className="streamer-avatar" 
              src={`https://images.websim.ai/avatar/${stream.username}`} 
              alt={stream.username} 
            />
            <div>
              <h2>{stream.title}</h2>
              <div>{stream.username}</div>
            </div>
          </div>
          <div className="stream-actions">
            <button className="action-btn" title="Follow">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </button>
            <button className="action-btn" title="Share">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      <div className="chat-panel">
        <div className="chat-header">
          Stream Chat ({viewers.length} viewers)
        </div>
        <div className="chat-messages" ref={chatMessagesRef}>
          {messages.map(message => (
            <div key={message.id} className="chat-message">
              <img 
                className="message-avatar" 
                src={`https://images.websim.ai/avatar/${message.author}`} 
                alt={message.author} 
              />
              <div className="message-content">
                <span className="message-author">{message.author}</span>
                <span className="message-text">{message.text}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="chat-input-container">
          <input
            type="text"
            className="chat-input"
            placeholder="Send a message"
            value={messageInput}
            onChange={e => setMessageInput(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && sendMessage()}
          />
          <button className="send-btn" onClick={sendMessage}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Go Live Modal Component
function GoLiveModal({ onClose, onStartStream, room }) {
  const [title, setTitle] = useState('');
  const [selectedScreen, setSelectedScreen] = useState(null);
  const [captureStream, setCaptureStream] = useState(null);
  const previewRef = useRef(null);
  
  const startCapture = async () => {
    try {
      const displayMediaOptions = {
        video: {
          cursor: "always"
        },
        audio: true
      };
      
      // Prompt user to select screen to capture
      const stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
      setCaptureStream(stream);
      
      // Show preview
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        previewRef.current.play();
      }
      
      // When stream ends (user stops sharing)
      stream.getVideoTracks()[0].onended = () => {
        setCaptureStream(null);
        setSelectedScreen(null);
      };
      
      setSelectedScreen(stream.getVideoTracks()[0].label);
    } catch (err) {
      console.error("Error capturing screen:", err);
    }
  };
  
  const goLive = async () => {
    if (!title || !captureStream) return;
    
    try {
      // Create a new live stream record
      const stream = await room.collection('liveStream').create({
        title,
        viewerCount: 0
      });
      
      // Notify other users that we're going live
      room.send({
        type: 'streamStarted',
        streamId: stream.id,
        title: title
      });
      
      onStartStream(stream);
    } catch (err) {
      console.error("Error starting stream:", err);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">Start Streaming</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="preview-container">
            {captureStream ? (
              <video ref={previewRef} width="100%" height="100%"></video>
            ) : (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '100%',
                flexDirection: 'column',
                gap: '16px' 
              }}>
                <button className="btn-primary" onClick={startCapture}>
                  Select Screen to Capture
                </button>
                <p>Choose which window or browser tab to share</p>
              </div>
            )}
          </div>
          
          {selectedScreen && (
            <div className="form-group">
              <div style={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                padding: '8px',
                borderRadius: '4px',
                marginBottom: '16px'
              }}>
                Capturing: {selectedScreen}
              </div>
            </div>
          )}
          
          <div className="form-group">
            <label className="form-label" htmlFor="stream-title">Stream Title</label>
            <input
              type="text"
              id="stream-title"
              className="form-input"
              placeholder="Give your stream a title"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>
          
          <button 
            className="btn-primary" 
            style={{ width: '100%' }}
            onClick={goLive}
            disabled={!title || !captureStream}
          >
            Go Live
          </button>
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(<App />);