"use server";
import { prisma } from "@/lib/prisma";
import { getDbUserId } from "./user.action";
import { revalidatePath } from "next/cache";

export async function createPost(content: string, imageUrl: string) {
  try {
    const userId = await getDbUserId();
    if (!userId) return;

    const post = await prisma.post.create({
      data: {
        content,
        image: imageUrl,
        authorId: userId,
      },
    });

    revalidatePath("/");
    return { success: true, post };
  } catch (error) {
    console.log("Failed to create post:", error);
    return { success: false, error: "Failed to create post" };
  }
}

export const getPosts = async () => {
  try {
    const posts = await prisma.post.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
            username: true,
          },
        },
        comments: {
          orderBy: {
            createdAt: "asc",
          },
          include: {
            author: {
              select: {
                id: true,
                username: true,
                image: true,
                name: true,
              },
            },
          },
        },
        likes: {
          select: {
            userId: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });
    // console.log(posts)

    return { success: true, posts };
  } catch (error) {
    console.error("Failed to get posts:", error);
    return { success: false, error: "Failed to get posts" };
  }
};

export const toggleLike = async (postId: string) => {
  try {
    const userId = await getDbUserId();
    if (!userId) return;

    // check if like exists
    const exisitingLike = await prisma.like.findUnique({
      where: {
        userId_postId: {
          postId,
          userId,
        },
      },
    });

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });

    if (!post) throw new Error("Post not found");

    if (exisitingLike) {
      // unlike
      await prisma.like.delete({
        where: {
          userId_postId: {
            postId,
            userId,
          },
        },
      });
    } else {
      // like and create notification (only if liking someoe else post)
      await prisma.$transaction([
        prisma.like.create({
          data: {
            userId,
            postId,
          },
        }),

        ...(post.authorId !== userId
          ? [
              prisma.notification.create({
                data: {
                  type: "LIKE",
                  userId: post.authorId, // recipient (post author)
                  creatorId: userId, // person who liked
                  postId,
                },
              }),
            ]
          : []),
      ]);
    }
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Failed to toggle like:", error);
    return { success: false, error: "Failed to toggle like" };
  }
};

export const createComment = async (postId: string, content: string) => {
  try {
    const userId = await getDbUserId();
    if (!userId) return;
    if (!content) throw new Error("Content is required");

    const post = await prisma.post.findUnique({
      where: {
        id: postId,
      },
      select: {
        authorId: true,
      },
    });

    if (!post) throw new Error("Post not found");

    const [comment] = await prisma.$transaction(async (tx) => {
      const newComment = await tx.comment.create({
        data: {
          content,
          authorId: userId,
          postId,
        },
      });

      if (post.authorId !== userId) {
        await tx.notification.create({
          data: {
            type: "COMMENT",
            userId: post.authorId,
            creatorId: userId,
            postId,
            commentId: newComment.id,
          },
        });
      }

      return [newComment];
    });
    revalidatePath("/");
    return { success: true, comment };
  } catch (error) {
    console.error("Failed to create comment", error);
    return { success: false, error: "Failed to create comment" };
  }
};

export const deletePost = async (postId: string) => {
  try {
    const userId = await getDbUserId();

    const post = await prisma.post.findUnique({
      where: {
        id: postId,
      },
    });
    if (!post) throw new Error("Post not Found");

    if (post.authorId !== userId)
      throw new Error("Unauthorized - no delete permission");

    await prisma.post.delete({
      where: {
        id: postId,
      },
    });
    revalidatePath("/")
    return {success: true}
  } catch (error) {
    console.error("Failed to delete post", error);
    return {success: false, error: "Failed to delete post"}
  }
};
