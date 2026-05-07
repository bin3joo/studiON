import { Client, type IFrame } from '@stomp/stompjs'

export const projectSocketClient = new Client({
  brokerURL: 'ws://localhost:8080/ws/projects',
  reconnectDelay: 5000,

  onStompError: (frame: IFrame) => {
    console.error('[Project Socket] STOMP 에러:', frame)
  },

  onWebSocketError: (error: Event) => {
    console.error('[Project Socket] 연결 에러:', error)
  },
})

export function connectProjectSocket() {
  if (!projectSocketClient.active) {
    projectSocketClient.activate()
  }
}

export function disconnectProjectSocket() {
  if (projectSocketClient.active) {
    projectSocketClient.deactivate()
  }
}