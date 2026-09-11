# DEV133 AUDIT — Mission MVP / Mission Control

## Baseline

`0.1.0-dev.132` foi preservado como milestone congelado. `dev.133` trabalha sobre cópia independente.

## Alterações principais

- Schema v5 para estado operacional de Missions.
- Commands autoritativos: create, prepare, release, launch e resolve.
- Migration v4→v5.
- Testes de contratos e integração do lifecycle completo.
- Mission Control completamente operacional na UI nova.
- Modais próprios para criação, preparação e After Action Resolution.
- CSS FUI específico de Mission Control, sem restaurar componentes visuais legados.

## Invariantes verificados

- Preparar não consome suprimento.
- Lançar consome exatamente uma vez.
- Retry do mesmo launch não repete consumo.
- Jogador sem audiência/controle é barrado.
- Assignment pode ser liberada antes do launch.
- Consequências são aplicadas ao Squad ao resolver.
- `currentMission` é liberado na resolução.
- Baixas inválidas são rejeitadas.
- CRUD legado não apaga os campos operacionais v5.
- UI chama commands autoritativos em vez de escrever Journal diretamente.

## Testes

- 89 testes automatizados verdes antes do empacotamento.
- 4 deles são contratos estáticos específicos do Mission Control.

## Riscos restantes

- Ainda é necessário smoke test dentro de Foundry VTT v13 real para validar aparência, foco de formulários, scroll e comportamento em múltiplas resoluções de tela.
- Atomicidade contra crash abrupto do processo continua limitada às garantias descritas no dev.130.
- Mission MVP não executa resolução automática de gameplay; o GM é a autoridade deliberada da resolução.

## Decisão

O vertical slice Mission está pronto para congelamento quando o ZIP final reproduzir a suíte completa e os checks estáticos.
