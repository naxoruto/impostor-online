import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket;
  
  public players$ = new BehaviorSubject<any[]>([]);
  public isOwner$ = new BehaviorSubject<boolean>(false);
  public createdRoomId$ = new BehaviorSubject<string>('');
  public timer$ = new BehaviorSubject<number>(60);
  
  public word$ = new BehaviorSubject<string>('');
  public categoryHint$ = new BehaviorSubject<string>('');
  public isImpostor$ = new BehaviorSubject<boolean>(false);
  public currentTurnPlayer$ = new BehaviorSubject<string>('');
  public gamePhase$ = new BehaviorSubject<string>('lobby');

  constructor() {
    this.socket = io('/'); // Tu IP aquí

    this.socket.on('room-created', (code) => {
        this.createdRoomId$.next(code);
    });

    this.socket.on('update-players', (data: any) => {
      this.players$.next(data.players);
      this.isOwner$.next(data.ownerId === this.socket.id);
    });

    this.socket.on('timer-update', (t) => this.timer$.next(t));
    
    this.socket.on('assign-role', (d) => {
      this.isImpostor$.next(d.role === 'impostor');
      this.word$.next(d.word);
      this.categoryHint$.next(d.category);
    });
    this.socket.on('change-phase', (p) => this.gamePhase$.next(p));
    this.socket.on('next-turn', (n) => this.currentTurnPlayer$.next(n));
  }

  getSocket() { return this.socket; }

  createRoom(username: string, emoji: string) {
    this.socket.emit('create-room', { username, emoji });
  }

  joinRoom(roomId: string, username: string, emoji: string) {
    this.socket.emit('join-room', { roomId, username, emoji });
  }

  setReady(roomId: string, isReady: boolean) {
    this.socket.emit('player-ready', { roomId, isReady });
  }
  
  startGameSignal(roomId: string, category: string, showHint: boolean) {
    this.socket.emit('start-game-signal', { roomId, category, showHint });
  }
  
  finishTurn(roomId: string) {
    this.socket.emit('finish-turn', { roomId });
  }
  
  vote(roomId: string, targetId: string) {
    this.socket.emit('vote-player', { roomId, targetId });
  }
  
  resetGame(roomId: string) {
    this.socket.emit('reset-game', { roomId });
  }
}