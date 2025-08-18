import { User } from "@/db/schema";
import { create } from "zustand";

type UserStore = {
	users: User;
	setUsers: (users: User) => void;
};

export const useUserStore = create<UserStore>((set) => ({
	users: {} as User, // Initialize with an empty object or a default User object
	setUsers: (users) => set({ users }),
}));
