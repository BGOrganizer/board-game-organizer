import { Counter } from "@/components/Counter";
import { Profile } from "@/components/Profile";

export default async function Matches() {

    return (
        <div className="flex-row justify-center items-center">
            <Profile />
            <Counter />
        </div>
    );
}