import * as THREE from 'three';
import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';

export interface RemotePlayer {
  id: string;
  name: string;
  team: 'alpha' | 'bravo';
  mesh?: THREE.Group;
  weaponMesh?: THREE.Mesh;
  position: THREE.Vector3;
  targetPosition: THREE.Vector3;
  rotationY: number;
  targetRotationY: number;
  stance: 'standing' | 'crouching' | 'sprinting' | 'sliding';
  weaponKey: string;
  health: number;
  isDead: boolean;
  score: number;
  isReady: boolean;
}

export class MultiplayerManager {
  private scene: THREE.Scene;
  public peer: Peer | null = null;
  public connections: { [id: string]: DataConnection } = {};
  public remotePlayers: { [id: string]: RemotePlayer } = {};

  public roomCode = '';
  public isHost = false;
  public localName = 'Player';
  public localTeam: 'alpha' | 'bravo' = 'alpha';
  public localId = '';
  public localReady = false;
  public matchActive = false;

  // Score stats
  public teamAlphaScore = 0;
  public teamBravoScore = 0;

  // Callbacks wired to UI / Main Loop
  public onRoomCreated?: (code: string) => void;
  public onPlayerJoined?: (players: { name: string; team: string; isLocal: boolean; isReady: boolean }[]) => void;
  public onMatchStartSignal?: () => void;
  public onRemoteShot?: (origin: THREE.Vector3, direction: THREE.Vector3, isEnemy: boolean) => void;
  public onRemoteGrenade?: (origin: THREE.Vector3, dir: THREE.Vector3) => void;
  public onLocalDamage?: (damage: number) => void;
  public onScoreUpdate?: (alpha: number, bravo: number) => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // Generates lobby code
  public createRoom(playerName: string, team: 'alpha' | 'bravo') {
    this.localName = playerName;
    this.localTeam = team;
    this.isHost = true;
    this.localReady = true; // Host is always ready

    const numericCode = Math.floor(100000 + Math.random() * 900000).toString();
    this.roomCode = numericCode;
    this.localId = `peer-${this.roomCode}-host`;

    this.initPeer(this.localId);
  }

  // Connects to an existing lobby
  public joinRoom(playerName: string, team: 'alpha' | 'bravo', code: string) {
    this.localName = playerName;
    this.localTeam = team;
    this.isHost = false;
    this.localReady = false;
    this.roomCode = code.trim();
    
    // Generate a random client peer ID
    const randomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.localId = `peer-${this.roomCode}-client-${randomId}`;

    this.initPeer(this.localId);
  }

  private initPeer(id: string) {
    this.peer = new Peer(id, {
      debug: 1
    });

    this.peer.on('open', () => {
      if (this.isHost) {
        if (this.onRoomCreated) this.onRoomCreated(this.roomCode);
        this.updateLobbyList();
      } else {
        // Connect to host peer directly
        const hostId = `peer-${this.roomCode}-host`;
        const conn = this.peer!.connect(hostId);
        this.setupConnection(conn);
        if (this.onRoomCreated) this.onRoomCreated(this.roomCode);
      }
    });

    this.peer.on('connection', (conn) => {
      // Host receives connections from clients
      this.setupConnection(conn);
    });
  }

  private setupConnection(conn: DataConnection) {
    this.connections[conn.peer] = conn;

    conn.on('open', () => {
      // Send identity info on open
      conn.send({
        type: 'identity',
        id: this.localId,
        name: this.localName,
        team: this.localTeam
      });
    });

    conn.on('data', (data: any) => {
      this.handlePacket(conn.peer, data);
    });

    conn.on('close', () => {
      this.removeRemotePlayer(conn.peer);
      delete this.connections[conn.peer];
      this.updateLobbyList();
    });
  }

  private handlePacket(peerId: string, packet: any) {
    switch (packet.type) {
      case 'identity':
        this.remotePlayers[peerId] = {
          id: peerId,
          name: packet.name,
          team: packet.team,
          position: new THREE.Vector3(),
          targetPosition: new THREE.Vector3(),
          rotationY: 0,
          targetRotationY: 0,
          stance: 'standing',
          weaponKey: 'rifle',
          health: 100,
          isDead: false,
          score: 0,
          isReady: packet.isReady || false
        };

        if (this.isHost) {
          // Sync new lobby list with all clients
          this.broadcastLobbySync();
          this.updateLobbyList();
        }
        break;

      case 'lobby_sync':
        // Clients receive the consolidated lobby list from Host
        this.remotePlayers = {};
        packet.players.forEach((p: any) => {
          if (p.id !== this.localId) {
            this.remotePlayers[p.id] = {
              id: p.id,
              name: p.name,
              team: p.team,
              position: new THREE.Vector3(),
              targetPosition: new THREE.Vector3(),
              rotationY: 0,
              targetRotationY: 0,
              stance: 'standing',
              weaponKey: 'rifle',
              health: 100,
              isDead: false,
              score: 0,
              isReady: p.isReady || false
            };
          }
        });
        this.updateLobbyList();
        break;

      case 'ready':
        if (this.remotePlayers[peerId]) {
          this.remotePlayers[peerId].isReady = packet.isReady;
          if (this.isHost) {
            this.broadcastLobbySync();
          }
          this.updateLobbyList();
        }
        break;

      case 'start_match':
        this.matchActive = true;
        if (this.onMatchStartSignal) this.onMatchStartSignal();
        break;

      case 'state':
        const rp = this.remotePlayers[peerId];
        if (rp) {
          rp.targetPosition.set(packet.pos.x, packet.pos.y, packet.pos.z);
          rp.targetRotationY = packet.rotY;
          rp.stance = packet.stance;
          rp.weaponKey = packet.weaponKey;
          rp.health = packet.health;
          rp.isDead = packet.isDead;
          
          if (!rp.mesh && this.matchActive) {
            this.createRemotePlayerMesh(rp);
          }
        }
        break;

      case 'shoot':
        const isEnemy = packet.team !== this.localTeam;
        if (this.onRemoteShot) {
          this.onRemoteShot(
            new THREE.Vector3(packet.origin.x, packet.origin.y, packet.origin.z),
            new THREE.Vector3(packet.dir.x, packet.dir.y, packet.dir.z),
            isEnemy
          );
        }
        break;

      case 'grenade':
        if (this.onRemoteGrenade) {
          this.onRemoteGrenade(
            new THREE.Vector3(packet.origin.x, packet.origin.y, packet.origin.z),
            new THREE.Vector3(packet.dir.x, packet.dir.y, packet.dir.z)
          );
        }
        break;

      case 'damage':
        // Someone tells us they hit us
        if (packet.targetId === this.localId && this.onLocalDamage) {
          this.onLocalDamage(packet.damage);
        }
        break;

      case 'kill':
        // A player was killed, sync scores
        this.teamAlphaScore = packet.alphaScore;
        this.teamBravoScore = packet.bravoScore;
        if (this.onScoreUpdate) {
          this.onScoreUpdate(this.teamAlphaScore, this.teamBravoScore);
        }
        break;
    }
  }

  // Sends the current state of local player to all connected peers
  public broadcastLocalState(position: THREE.Vector3, rotY: number, stance: string, weaponKey: string, health: number, isDead: boolean) {
    const packet = {
      type: 'state',
      pos: { x: position.x, y: position.y, z: position.z },
      rotY,
      stance,
      weaponKey,
      health,
      isDead
    };
    this.broadcast(packet);
  }

  // Broadcasts a bullet shot trace
  public broadcastShot(origin: THREE.Vector3, dir: THREE.Vector3) {
    const packet = {
      type: 'shoot',
      team: this.localTeam,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      dir: { x: dir.x, y: dir.y, z: dir.z }
    };
    this.broadcast(packet);
  }

  // Broadcasts a grenade throw
  public broadcastGrenade(origin: THREE.Vector3, dir: THREE.Vector3) {
    const packet = {
      type: 'grenade',
      origin: { x: origin.x, y: origin.y, z: origin.z },
      dir: { x: dir.x, y: dir.y, z: dir.z }
    };
    this.broadcast(packet);
  }

  // Broadcasts a hit (calculated client-side on shooter, sent to target)
  public sendHit(targetId: string, damage: number) {
    const packet = {
      type: 'damage',
      targetId,
      damage
    };
    // Send to target connection directly or broadcast
    if (this.connections[targetId]) {
      this.connections[targetId].send(packet);
    }
  }

  // Tells everyone a kill occurred and relays the score
  public broadcastKill(killerTeam: 'alpha' | 'bravo') {
    if (killerTeam === 'alpha') this.teamAlphaScore++;
    else this.teamBravoScore++;

    const packet = {
      type: 'kill',
      alphaScore: this.teamAlphaScore,
      bravoScore: this.teamBravoScore
    };
    this.broadcast(packet);

    if (this.onScoreUpdate) {
      this.onScoreUpdate(this.teamAlphaScore, this.teamBravoScore);
    }
  }

  // Tells everyone to start the match (called by Host)
  public startMatch() {
    if (!this.isHost) return;
    this.matchActive = true;
    this.broadcast({ type: 'start_match' });
    if (this.onMatchStartSignal) this.onMatchStartSignal();
  }

  // Broadcast sync list of connected peers
  private broadcastLobbySync() {
    const players = [
      { id: this.localId, name: this.localName, team: this.localTeam, isReady: this.isHost ? true : this.localReady }
    ];
    Object.keys(this.remotePlayers).forEach(k => {
      const rp = this.remotePlayers[k];
      players.push({ id: rp.id, name: rp.name, team: rp.team, isReady: rp.isReady });
    });

    this.broadcast({
      type: 'lobby_sync',
      players
    });
  }

  public toggleReady() {
    if (this.isHost) return; // Host is always ready
    this.localReady = !this.localReady;
    this.broadcast({
      type: 'ready',
      isReady: this.localReady
    });
    this.updateLobbyList();
  }

  private updateLobbyList() {
    const players = [
      { name: this.localName, team: this.localTeam, isLocal: true, isReady: this.isHost ? true : this.localReady }
    ];
    Object.keys(this.remotePlayers).forEach(k => {
      const rp = this.remotePlayers[k];
      players.push({ name: rp.name, team: rp.team, isLocal: false, isReady: rp.isReady });
    });

    if (this.onPlayerJoined) this.onPlayerJoined(players);
  }

  // Helpers to send data packages to all connected connections
  private broadcast(data: any) {
    Object.keys(this.connections).forEach(id => {
      const conn = this.connections[id];
      if (conn.open) {
        conn.send(data);
      }
    });
  }

  // Create high-fidelity scifi representation meshes for other peers
  private createRemotePlayerMesh(rp: RemotePlayer) {
    const group = new THREE.Group();

    // Body armor: carbon metallic chest plate
    const torsoGeo = new THREE.BoxGeometry(0.7, 1.0, 0.4);
    const torsoMat = new THREE.MeshStandardMaterial({
      color: 0x22252a,
      roughness: 0.5,
      metalness: 0.8
    });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 0.5;
    group.add(torso);

    // Glowing scifi indicator bands: Blue for Alpha, Orange for Bravo
    const visorColor = rp.team === 'alpha' ? 0x00ffcc : 0xff5500;
    
    const visorGeo = new THREE.BoxGeometry(0.5, 0.12, 0.42);
    const visorMat = new THREE.MeshBasicMaterial({ color: visorColor });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.15, 0.05);
    group.add(visor);

    // Head unit
    const headGeo = new THREE.BoxGeometry(0.45, 0.45, 0.4);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x181a1d, roughness: 0.6 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.15;
    group.add(head);

    // Weapon cylinder block
    const weaponGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.8);
    weaponGeo.rotateX(Math.PI / 2);
    const weaponMat = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.7, metalness: 0.9 });
    const weapon = new THREE.Mesh(weaponGeo, weaponMat);
    weapon.position.set(0.3, 0.4, 0.4);
    group.add(weapon);
    rp.weaponMesh = weapon;

    group.position.copy(rp.position);
    this.scene.add(group);
    
    rp.mesh = group;
  }

  private removeRemotePlayer(id: string) {
    const rp = this.remotePlayers[id];
    if (rp) {
      if (rp.mesh) this.scene.remove(rp.mesh);
      delete this.remotePlayers[id];
    }
  }

  // Smooth lerp updating for network position offsets
  public updateRemoteMovement(dt: number) {
    Object.keys(this.remotePlayers).forEach(id => {
      const rp = this.remotePlayers[id];
      if (rp.mesh) {
        // Lerp position smoothly
        rp.position.lerp(rp.targetPosition, 16 * dt);
        rp.mesh.position.copy(rp.position);

        // Adjust height base on stance
        let targetHeight = 0;
        if (rp.stance === 'crouching' || rp.stance === 'sliding') targetHeight = -0.4;
        rp.mesh.position.y += targetHeight;

        // Smoothly lerp heading rotation
        rp.rotationY = THREE.MathUtils.lerp(rp.rotationY, rp.targetRotationY, 16 * dt);
        rp.mesh.rotation.y = rp.rotationY;
      }
    });
  }

  public reset() {
    Object.keys(this.remotePlayers).forEach(id => this.removeRemotePlayer(id));
    this.connections = {};
    this.remotePlayers = {};
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.matchActive = false;
    this.teamAlphaScore = 0;
    this.teamBravoScore = 0;
  }
}
