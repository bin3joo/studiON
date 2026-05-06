import SockJS from 'sockjs-client';
import { Client, type IMessage } from '@stomp/stompjs';

type EventHandler = (data: any) => void;

class SocketService {
  private stompClient: Client | null = null;
  private currentProjectId: number | null = null;

  private listeners: Map<string, EventHandler[]> = new Map();
  private activeSubscriptions: Set<string> = new Set();

  connect(projectId: number) {
    this.currentProjectId = projectId;

    // 환경 변수에서 웹소켓 주소 가져오기 (없으면 localhost 풀백)
    const wsUrl = import.meta.env.VITE_WS_BASE_URL || 'http://localhost:8080/ws';

    this.stompClient = new Client({
      webSocketFactory: () => new SockJS(wsUrl),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    this.stompClient.onConnect = () => {
      console.log(`[Socket] 프로젝트 ${projectId} STOMP 연결 성공!`);
      // 프로젝트 입장 알림 서버로 전송
      this.publish('PROJECT_JOIN', { projectId });

      // 등록된 리스너들을 모두 실제 채널에 구독 바인딩
      this.listeners.forEach((_, eventType) => {
        this.bindStompSubscription(eventType);
      });
    };

    this.stompClient.onStompError = (frame) => {
      console.error('[Socket] 브로커 에러:', frame.headers['message'], frame.body);
    };

    this.stompClient.activate();
  }

  subscribe(eventType: string, callback: EventHandler) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)?.push(callback);

    if (this.stompClient && this.stompClient.connected) {
      this.bindStompSubscription(eventType);
    }
  }

  private bindStompSubscription(eventType: string) {
    if (!this.stompClient || !this.currentProjectId) return;
    if (this.activeSubscriptions.has(eventType)) return;

    // 모든 이벤트는 기본 라우팅 규칙 적용
    const topicUrl = `/topic/projects/${this.currentProjectId}/${eventType}`;

    this.stompClient.subscribe(topicUrl, (message: IMessage) => {
      try {
        const payload = JSON.parse(message.body);
        console.log(`[Socket] 수신 [${eventType}]:`, payload);

        const callbacks = this.listeners.get(eventType) || [];
        callbacks.forEach(cb => cb(payload));
      } catch (e) {
        console.error(`[Socket] 메시지 파싱 에러 (${eventType}):`, e);
      }
    });

    this.activeSubscriptions.add(eventType);
  }

  publish(eventType: string, payload: any) {
    if (!this.stompClient || !this.stompClient.connected || !this.currentProjectId) {
      console.warn(`[Socket] 연결되지 않은 상태에서 전송 시도됨: ${eventType}`);
      return;
    }

    const destination = `/app/projects/${this.currentProjectId}/${eventType}`;
    this.stompClient.publish({
      destination: destination,
      body: JSON.stringify(payload)
    });

    console.log(`[Socket] 발신 [${eventType}]:`, payload);
  }

  disconnect() {
    console.log('[Socket]웹소켓 연결 해제됨');
    if (this.stompClient) this.stompClient.deactivate();
    this.activeSubscriptions.clear();
    this.listeners.clear();
    this.currentProjectId = null;
  }
}

export const socketService = new SocketService();