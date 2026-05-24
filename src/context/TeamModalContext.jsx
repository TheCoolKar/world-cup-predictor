import { createContext, useContext, useState } from "react";

const TeamModalContext = createContext(null);

export function TeamModalProvider({ children }) {
  const [team, setTeam] = useState(null);
  return (
    <TeamModalContext.Provider value={{ openTeam: setTeam, closeTeam: () => setTeam(null), team }}>
      {children}
    </TeamModalContext.Provider>
  );
}

export function useTeamModal() {
  return useContext(TeamModalContext);
}
