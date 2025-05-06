import { supabaseClient } from "./utils/supabase";


export const updateUserProfileById = async (userId: string, record: Record<string, any>) => {
    const { data, error } = await supabaseClient
      .from('profiles')
      .update(record)
      .eq('id', userId);
  
  
    if (error) {
      throw new Error(error.message || "Supabase update failed");
    }

    return data;
  };
  