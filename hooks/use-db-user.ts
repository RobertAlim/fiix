import { useUser } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { User } from "@/db/schema";

export const useDBUser = () => {
	const { user, isLoaded } = useUser();

	return useQuery<User>({
		queryKey: ["dbUser", user?.id],
		enabled: isLoaded && !!user,
		queryFn: async () => {
			const res = await fetch(`/api/user-status?userId=${user?.id}`);
			if (!res.ok) throw new Error("Failed to fetch user from DB");
			return res.json();
		},
	});
};
