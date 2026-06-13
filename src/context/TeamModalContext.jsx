import { createContext, useContext, useState } from "react";

const TeamModalContext = createContext(null);

export function TeamModalProvider({ children }) {
  const [team, setTeam]     = useState(null);
  const [player, setPlayer] = useState(null); // { id, name, team } for the player profile modal

  return (
    <TeamModalContext.Provider
      value={{
        team,
        openTeam:   setTeam,
        closeTeam:  () => setTeam(null),
        player,
        openPlayer: setPlayer,
        closePlayer: () => setPlayer(null),
      }}
    >
      {children}
    </TeamModalContext.Provider>
  );
}

export function useTeamModal() {
  return useContext(TeamModalContext);
}
