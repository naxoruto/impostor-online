import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { SocketService } from '../services/socket.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    IonicModule
  ],
})
export class HomePage {
  username = '';
  roomId = '';
  userEmoji = '🧑‍🚀';
  joined = false;
  isReady = false;
  loginMode = 'create';
  selectedPlayerId: string | null = null;

  countdown: number | null = null;
  voteCounts: any = {};
  gameResult: any = null;
  
  players$ = this.socketService.players$;
  isOwner$ = this.socketService.isOwner$;
  timer$ = this.socketService.timer$;
  currentTurnPlayer$ = this.socketService.currentTurnPlayer$;
  phase$ = this.socketService.gamePhase$;
  word$ = this.socketService.word$;
  categoryHint$ = this.socketService.categoryHint$;
  isImpostor$ = this.socketService.isImpostor$;

  emojis = ['🧑‍🚀', '👽', '🤖', '🐱', '🐶', '💀', '👻', '🤡', '🦁', '🦄'];
  // Lista manual para evitar el error del require
  categories = ['Futbolistas', 'Deportistas', 'Cantantes', 'Objetos', 'Profesion', 'Random'];
  
  selectedCategory = 'Random';
  enableHint = true;

  constructor(private socketService: SocketService) {
    // 1. Unirse automáticamente si creo la sala
    this.socketService.createdRoomId$.subscribe(code => {
      if(code) {
        this.roomId = code;
        this.joined = true;
      }
    });

    // 2. Escuchar la cuenta regresiva del Lobby
    this.socketService.getSocket().on('countdown', (num: number) => {
      this.countdown = num;
      // Solo sonido visual, el audio fuerte viene al asignar rol
    });
    
    // 3. NUEVO: SONIDOS DE INICIO DE PARTIDA (ROLES)
    this.socketService.getSocket().on('assign-role', (data: any) => {
      if (data.role === 'impostor') {
        this.playSound('start'); // Sonido Tensión Impostor
      } else {
        this.playTimedSound('tripulante', 4000); // Sonido Tripulante (4 segs)
      }
    });

    // 4. NUEVO: SONIDOS DE FINAL DE PARTIDA
    this.socketService.getSocket().on('game-result', (res) => {
        this.gameResult = res;
        if (res.success) {
          this.playSound('win'); // Mataron al impostor (Victoria)
        } else {
          this.playSound('kill'); // Mataron al equivocado (Derrota/Error)
        }
    });

    this.socketService.getSocket().on('update-votes', (c) => this.voteCounts = c);

    this.socketService.getSocket().on('change-phase', (phase) => {
        if(phase === 'lobby') {
            this.gameResult = null;
            this.voteCounts = {};
            this.isReady = false;
            this.countdown = null;
            this.selectedPlayerId = null;
        }
    });
  }

  processLogin() {
    if (!this.username) return;
    if (this.loginMode === 'create') {
        this.socketService.createRoom(this.username, this.userEmoji);
    } else {
        if (!this.roomId) return;
        this.socketService.joinRoom(this.roomId, this.username, this.userEmoji);
        this.joined = true;
    }
  }

  toggleReady() {
    this.isReady = !this.isReady;
    this.socketService.setReady(this.roomId, this.isReady);
  }

  startActualGame() {
    // Cuando el contador llega a 0, el dueño manda la señal
    const amIOwner = this.socketService.isOwner$.getValue();
    if(amIOwner) {
      this.socketService.startGameSignal(this.roomId, this.selectedCategory, this.enableHint);
    }
  }

  finishTurn() {
    this.socketService.finishTurn(this.roomId);
  }

  vote(targetId: string) {
    this.selectedPlayerId = targetId;
    this.socketService.vote(this.roomId, targetId);
  }

  triggerReset() {
    this.socketService.resetGame(this.roomId);
  }
  
  getPlayerStyle(index: number, total: number | null | undefined) {
    if (!total) return {};
    const radius = 130; 
    const angle = (index / total) * 2 * Math.PI - (Math.PI / 2); 
    return { transform: `translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px)` };
  }

  // REPRODUCIR SONIDO NORMAL
  playSound(name: string) {
    const audio = new Audio(`assets/${name}.mp3`);
    audio.play().catch(e => console.log("Error audio:", e));
  }

  // REPRODUCIR SONIDO CON TIEMPO LIMITE (Para el tripulante)
  playTimedSound(name: string, duration: number) {
    const audio = new Audio(`assets/${name}.mp3`);
    audio.play().catch(e => console.log("Error audio:", e));
    
    // Cortar el audio después de X milisegundos
    setTimeout(() => {
      audio.pause();
      audio.currentTime = 0;
    }, duration);
  }
}